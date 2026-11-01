import type { Replay, Policy, Trace } from '../data/schema';

export function metrics(replay: Replay, policy: Policy, period: number) {
  const records = policy.trace.filter(e => e.period <= period);
  const planned = records.filter(e => e.consequence === 'planned_replacement').length;
  const failures = records.filter(e => e.consequence === 'unexpected_failure').length;
  const unusedLife = records.reduce((sum, e) => sum + e.unusedLife, 0);
  const offeredSlots = new Set(records.map(e => e.period)).size * replay.scenario.slotsPerCycle;
  const costBreakdown = {
    planned: planned * replay.scenario.replacementCost,
    unexpectedFailure: failures * replay.scenario.failureCost,
    unusedLife: unusedLife * replay.scenario.unusedLifeCostPerCycle,
  };
  return { planned, failures, unusedLife, usedSlots: planned, offeredSlots,
    utilization: offeredSlots ? planned / offeredSlots : null,
    totalCost: Object.values(costBreakdown).reduce((a, b) => a + b, 0), costBreakdown };
}

export const denied = (event: Trace) => event.requested && event.chosenAction === 'continue';
