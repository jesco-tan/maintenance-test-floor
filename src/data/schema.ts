import { metrics } from '../replay/metrics';

export interface Trace {
  engineId: number; cycle: number; period: number; estimatedRisk: number | null;
  requested: boolean; availableSlots: number; chosenAction: 'replace' | 'continue';
  consequence: 'operating' | 'planned_replacement' | 'unexpected_failure'; unusedLife: number; cost: number;
}
export type Rule = { kind: 'fixed'; interval: number } |
  { kind: 'sensor'; sensorIndex: number; direction: number; threshold: number } |
  { kind: 'risk'; threshold: number; model: string };
export interface Summary {
  totalCost: number; planned: number; failures: number; unusedLife: number;
  usedSlots: number; offeredSlots: number; utilization: number;
  costBreakdown: { planned: number; unexpectedFailure: number; unusedLife: number };
}
export interface Policy { id: string; label: string; sourceName: string; rule: Rule; trace: Trace[]; summary: Summary }
export interface Replay {
  schemaVersion: 1;
  provenance: { repository: string; commit: string; fixture: string; command: string; generatedAt: string;
    classification: 'held-out toy evaluation' | 'mechanics demonstration'; notes: string; inputSha256: string };
  scenario: { id: string; label: string; splitSeed: number; riskHorizon: number; slotsPerCycle: number;
    replacementCost: number; failureCost: number; unusedLifeCostPerCycle: number;
    startCycles: Record<string, number>; heldOutEngineIds: number[] };
  engines: { id: number; observations: { cycle: number; sensors: number[] }[] }[];
  sensorLabels: string[];
  retrospective: { engineId: number; failureCycle: number }[];
  policies: Policy[];
}

const fail = (message: string): never => { throw new Error(`Invalid replay: ${message}`); };
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) fail(message); }
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nonnegative = (x: unknown): x is number => finite(x) && x >= 0;
const integer = (x: unknown): x is number => finite(x) && Number.isInteger(x) && x >= 1;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-8;

/** Runtime boundary for static assets and reproducible exports. Never trusts a type assertion alone. */
export function validateReplay(input: unknown): Replay {
  requireThat(object(input) && input.schemaVersion === 1, 'unsupported schema version');
  const r = input;
  requireThat(object(r.provenance), 'missing provenance');
  for (const key of ['repository', 'commit', 'fixture', 'command', 'generatedAt', 'classification', 'notes', 'inputSha256'])
    requireThat(typeof r.provenance[key] === 'string' && r.provenance[key].length > 0, `provenance ${key}`);
  requireThat(/^[a-f0-9]{40}$/.test(r.provenance.commit) && /^[a-f0-9]{64}$/.test(r.provenance.inputSha256), 'source hashes');
  requireThat(!Number.isNaN(Date.parse(r.provenance.generatedAt)), 'generation date');
  requireThat(['held-out toy evaluation', 'mechanics demonstration'].includes(r.provenance.classification), 'classification');
  requireThat(object(r.scenario), 'missing scenario');
  const s = r.scenario;
  requireThat(typeof s.id === 'string' && typeof s.label === 'string' && Number.isInteger(s.splitSeed) && s.splitSeed >= 0, 'scenario identity');
  requireThat(integer(s.riskHorizon) && Number.isInteger(s.slotsPerCycle) && s.slotsPerCycle >= 0, 'capacity or horizon');
  for (const key of ['replacementCost', 'failureCost', 'unusedLifeCostPerCycle']) requireThat(nonnegative(s[key]), `scenario ${key}`);
  requireThat(object(s.startCycles) && Array.isArray(s.heldOutEngineIds), 'start cycles or held-out IDs');
  requireThat(Array.isArray(r.sensorLabels) && r.sensorLabels.length > 0 && r.sensorLabels.every((v: unknown) => typeof v === 'string'), 'sensor labels');
  requireThat(Array.isArray(r.engines) && r.engines.length > 0 && Array.isArray(r.retrospective), 'engine metadata');
  const ids = new Set<number>();
  const lengths = new Map<number, number>();
  for (const e of r.engines) {
    requireThat(object(e) && integer(e.id) && !ids.has(e.id), 'duplicate or invalid engine ID');
    ids.add(e.id);
    requireThat(integer(s.startCycles[e.id]), 'invalid engine start');
    requireThat(Array.isArray(e.observations) && e.observations.length > 0, 'missing observations');
    e.observations.forEach((o: unknown, index: number) => {
      requireThat(object(o) && o.cycle === index + 1 && Array.isArray(o.sensors) && o.sensors.length === r.sensorLabels.length && o.sensors.every(finite), 'invalid observation history');
    });
    lengths.set(e.id, e.observations.length);
  }
  requireThat(Object.keys(s.startCycles).length === ids.size, 'extraneous starts');
  requireThat(s.heldOutEngineIds.every((id: number) => ids.has(id)) && new Set(s.heldOutEngineIds).size === s.heldOutEngineIds.length, 'held-out identity');
  if (r.provenance.classification === 'held-out toy evaluation') requireThat(s.heldOutEngineIds.length === ids.size, 'held-out fleet mismatch');
  requireThat(r.retrospective.length === ids.size && new Set(r.retrospective.map((x: any) => x.engineId)).size === ids.size, 'retrospective metadata count');
  for (const terminal of r.retrospective) requireThat(object(terminal) && lengths.get(terminal.engineId) === terminal.failureCycle, 'retrospective terminal cycle');
  requireThat(Array.isArray(r.policies) && r.policies.length === 3, 'expected three policies');
  const policyIds = new Set<string>();
  const kinds = new Set<string>();
  for (const p of r.policies) {
    requireThat(object(p) && typeof p.id === 'string' && !policyIds.has(p.id) && typeof p.label === 'string' && typeof p.sourceName === 'string', 'policy identity');
    policyIds.add(p.id);
    requireThat(object(p.rule), 'structured rule missing');
    const rule = p.rule;
    requireThat(['fixed', 'sensor', 'risk'].includes(rule.kind) && !kinds.has(rule.kind), 'policy kinds');
    kinds.add(rule.kind);
    if (rule.kind === 'fixed') requireThat(integer(rule.interval), 'replacement interval');
    if (rule.kind === 'sensor') requireThat(Number.isInteger(rule.sensorIndex) && rule.sensorIndex >= 0 && rule.sensorIndex < r.sensorLabels.length && [1, -1].includes(rule.direction) && finite(rule.threshold), 'sensor rule');
    if (rule.kind === 'risk') requireThat(nonnegative(rule.threshold) && rule.threshold <= 1 && typeof rule.model === 'string', 'risk rule');
    requireThat(Array.isArray(p.trace) && p.trace.length > 0, 'empty trace');
    const previous = new Map<number, number>();
    const terminated = new Set<number>();
    const allocations = new Map<number, number>();
    let lastPeriod = 0;
    for (const t of p.trace) {
      requireThat(object(t) && ids.has(t.engineId) && integer(t.period) && integer(t.cycle), 'trace engine/cycle');
      requireThat(t.period >= lastPeriod, 'unordered periods'); lastPeriod = t.period;
      requireThat(!terminated.has(t.engineId), 'event after termination');
      requireThat(t.cycle === (previous.get(t.engineId) ?? 0) + 1 && t.period === s.startCycles[t.engineId] + t.cycle - 1, 'missing or duplicate engine record');
      previous.set(t.engineId, t.cycle);
      requireThat(t.cycle <= lengths.get(t.engineId)!, 'event beyond observed life');
      requireThat(typeof t.requested === 'boolean' && t.availableSlots === s.slotsPerCycle, 'request or capacity');
      requireThat(t.estimatedRisk === null || (finite(t.estimatedRisk) && t.estimatedRisk >= 0 && t.estimatedRisk <= 1), 'invalid risk');
      requireThat(rule.kind === 'risk' ? t.estimatedRisk !== null : t.estimatedRisk === null, 'non-risk policies require null risk');
      requireThat(['replace', 'continue'].includes(t.chosenAction), 'chosen action');
      const replace = t.chosenAction === 'replace';
      requireThat(!replace || t.requested, 'replacement without request');
      const failed = !replace && t.cycle === lengths.get(t.engineId);
      requireThat(t.consequence === (replace ? 'planned_replacement' : failed ? 'unexpected_failure' : 'operating'), 'invalid consequence');
      const unused = replace ? lengths.get(t.engineId)! - t.cycle : 0;
      requireThat(t.unusedLife === unused && finite(t.cost) && close(t.cost, replace ? s.replacementCost + unused * s.unusedLifeCostPerCycle : failed ? s.failureCost : 0), 'event cost or unused life');
      if (replace) allocations.set(t.period, (allocations.get(t.period) ?? 0) + 1);
      if (replace || failed) terminated.add(t.engineId);
    }
    requireThat(terminated.size === ids.size, 'missing terminal outcomes');
    requireThat([...allocations.values()].every(n => n <= s.slotsPerCycle), 'capacity violation');
    requireThat(object(p.summary) && object(p.summary.costBreakdown), 'source summary missing');
    const calculated = metrics(r as Replay, p as Policy, lastPeriod);
    for (const key of ['totalCost', 'planned', 'failures', 'unusedLife', 'usedSlots', 'offeredSlots', 'utilization'] as const) {
      requireThat(finite(p.summary[key]) && close(p.summary[key], calculated[key] ?? 0), `summary reconciliation: ${key}`);
    }
    for (const key of ['planned', 'unexpectedFailure', 'unusedLife'] as const)
      requireThat(finite(p.summary.costBreakdown[key]) && close(p.summary.costBreakdown[key], calculated.costBreakdown[key]), `cost breakdown: ${key}`);
  }
  return r as Replay;
}
