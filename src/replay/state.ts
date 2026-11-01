import type { Policy, Replay, Trace } from '../data/schema';
import { metrics } from './metrics';

export type Status = 'not started' | 'operating' | 'replaced' | 'failed';
export function endPeriod(policy: Policy) { return Math.max(0, ...policy.trace.map(e => e.period)); }
export function clampPeriod(policy: Policy, period: number) {
  return Math.min(endPeriod(policy), Math.max(0, Math.trunc(Number.isFinite(period) ? period : 0)));
}
export function reconstruct(replay: Replay, policy: Policy, cursor: number) {
  const period = clampPeriod(policy, cursor);
  const engines = replay.engines.map(engine => {
    const history = policy.trace.filter(e => e.engineId === engine.id && e.period <= period);
    const last = history.at(-1);
    const status: Status = !last ? 'not started' : last.consequence === 'planned_replacement' ? 'replaced'
      : last.consequence === 'unexpected_failure' ? 'failed' : 'operating';
    return { id: engine.id, status, cycle: last?.cycle ?? 0, history,
      current: last?.period === period ? last : undefined,
      observations: engine.observations.filter(o => o.cycle <= (last?.cycle ?? 0)),
    };
  });
  return { period, engines, events: policy.trace.filter(e => e.period === period),
    metrics: metrics(replay, policy, period), operating: engines.filter(e => e.status === 'operating').length };
}
export type State = ReturnType<typeof reconstruct>;

export function storyBeats(policy: Policy): { period: number; text: string; engineId?: number }[] {
  const first = policy.trace[0];
  const request = policy.trace.find(e => e.requested);
  const conflict = policy.trace.find(e => e.requested && e.chosenAction === 'continue');
  const terminal = policy.trace.find(e => e.consequence !== 'operating');
  return [
    { period: first?.period ?? 0, engineId: first?.engineId, text: 'Each engine is one observed life. The policy sees only readings available through its current local cycle.' },
    { period: request?.period ?? 0, engineId: request?.engineId, text: request ? 'The selected policy requests a replacement when its rule triggers. A request competes for the current period\'s service slot.' : 'This policy makes no replacement request in this fixture.' },
    { period: conflict?.period ?? request?.period ?? 0, engineId: conflict?.engineId, text: conflict ? 'More requests than available slots. A denied engine stays here and may fail in this same period. The board clears next period.' : 'This trace has no competing requests. Select the mechanics demonstration to explore capacity contention.' },
    { period: terminal?.period ?? 0, engineId: terminal?.engineId, text: 'A replacement or failure ends this engine life. Replacement is allocated before end-of-period failure. No engine returns to service.' },
    { period: endPeriod(policy), text: 'Compare final outcomes on identical assumptions below. Costs and discarded life are retrospective accounting, not policy observations.' },
  ];
}
