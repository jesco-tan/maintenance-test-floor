import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { validateReplay, type Replay } from '../src/data/schema';
import { clampPeriod, endPeriod, reconstruct, storyBeats } from '../src/replay/state';
import { denied, metrics } from '../src/replay/metrics';
import { inspector, comparison, eventLog } from '../src/ui/views';

const load = (file: string) => validateReplay(JSON.parse(readFileSync(new URL(`../public/data/${file}.json`, import.meta.url), 'utf8')));
const heldOut = load('held-out');
const mechanics = load('mechanics');
const extended = load('extended');
const clone = (replay: Replay = mechanics) => structuredClone(replay);

describe('source-compatible fixture accounting', () => {
  for (const replay of [heldOut, mechanics, extended]) for (const policy of replay.policies) {
    test(`${replay.scenario.id}: ${policy.id} agrees with source totals`, () => {
      const m = metrics(replay, policy, endPeriod(policy));
      expect(m.totalCost).toBeCloseTo(policy.summary.totalCost, 10);
      expect(m.planned).toBe(policy.summary.planned);
      expect(m.failures).toBe(policy.summary.failures);
      expect(m.unusedLife).toBe(policy.summary.unusedLife);
      expect(m.offeredSlots).toBe(policy.summary.offeredSlots);
      expect(m.costBreakdown).toEqual(policy.summary.costBreakdown);
      expect(reconstruct(replay, policy, endPeriod(policy)).engines.every(e => ['replaced', 'failed'].includes(e.status))).toBe(true);
    });
  }
  test('evaluation fleet is exactly the held-out subset', () => {
    expect(heldOut.engines).toHaveLength(3);
    expect(heldOut.engines.map(e => e.id).sort()).toEqual([...heldOut.scenario.heldOutEngineIds].sort());
    expect(heldOut.policies.map(p => p.summary.totalCost)).toEqual([11, 7, 3.02]);
  });
  test('denied request fails in the same period, replacement at final cycle has zero unused life', () => {
    const policy = mechanics.policies[0];
    const failure = policy.trace.find(e => denied(e) && e.consequence === 'unexpected_failure')!;
    expect(failure.engineId).toBe(102); expect(failure.period).toBe(3);
    expect(failure.cost).toBe(5);
    const terminal = policy.trace.find(e => e.engineId === 101 && e.chosenAction === 'replace')!;
    expect(terminal.period).toBe(failure.period); expect(terminal.unusedLife).toBe(0); expect(terminal.cost).toBe(1);
    const state = reconstruct(mechanics, policy, 3);
    expect(state.engines.find(e => e.id === 102)?.status).toBe('failed');
    expect(state.metrics.totalCost).toBe(6);
  });
  test('empty calendar periods offer no slots and staggered engines do not age early', () => {
    const policy = mechanics.policies[0];
    expect(reconstruct(mechanics, policy, 0).metrics.utilization).toBeNull();
    expect(metrics(mechanics, policy, 5).offeredSlots).toBe(3);
    const before = reconstruct(mechanics, policy, 5).engines.find(e => e.id === 103)!;
    expect(before.status).toBe('not started'); expect(before.observations).toEqual([]); expect(before.cycle).toBe(0);
    const started = reconstruct(mechanics, policy, 6).engines.find(e => e.id === 103)!;
    expect(started.cycle).toBe(1); expect(started.observations).toHaveLength(1);
    expect(metrics(mechanics, policy, 6).offeredSlots).toBe(4);
  });
  test('non-risk policies export null, never a fabricated probability', () => {
    for (const replay of [heldOut, mechanics, extended]) for (const policy of replay.policies.filter(p => p.rule.kind !== 'risk'))
      expect(policy.trace.every(e => e.estimatedRisk === null)).toBe(true);
  });
  test('extended demo runs through 30 real calendar periods for every policy', () => {
    expect(extended.provenance.classification).toBe('mechanics demonstration');
    expect(extended.scenario.heldOutEngineIds).toEqual([]);
    for (const policy of extended.policies) {
      expect(endPeriod(policy)).toBe(30);
      expect(new Set(policy.trace.map(e => e.period)).size).toBe(30);
      expect(policy.trace.some(e => e.period === 30 && e.consequence !== 'operating')).toBe(true);
    }
    const sensor = extended.policies.find(p => p.id === 'sensor')!;
    expect(sensor.trace.some(e => denied(e) && e.consequence === 'unexpected_failure')).toBe(true);
  });
});

describe('deterministic cursor and presentation boundaries', () => {
  test('every backwards seek and repeated replay is history-independent', () => {
    for (const replay of [heldOut, mechanics, extended]) for (const policy of replay.policies) {
      const original = structuredClone(replay);
      const forward = Array.from({ length: endPeriod(policy) + 1 }, (_, p) => reconstruct(replay, policy, p));
      for (let p = endPeriod(policy); p >= 0; p--) expect(reconstruct(replay, policy, p)).toEqual(forward[p]);
      expect(replay).toEqual(original);
    }
  });
  test('switching policies retains period, clamps to end, and keeps engine identity', () => {
    for (const policy of heldOut.policies) {
      expect(clampPeriod(policy, 3)).toBe(3);
      expect(clampPeriod(policy, 999)).toBe(endPeriod(policy));
      expect(clampPeriod(policy, -1)).toBe(0);
      expect(clampPeriod(policy, Number.NaN)).toBe(0);
      expect(reconstruct(heldOut, policy, 3).engines.map(e => e.id)).toEqual(heldOut.engines.map(e => e.id));
    }
  });
  test('inspector never shows future readings or retrospective terminal metadata', () => {
    for (const policy of heldOut.policies) {
      const state = reconstruct(heldOut, policy, 2);
      for (const engine of state.engines) {
        expect(engine.observations.every(o => o.cycle <= 2)).toBe(true);
        expect(engine.history.every(e => e.period <= 2)).toBe(true);
        const html = inspector(heldOut, policy, engine);
        expect(html).not.toContain('failureCycle'); expect(html).not.toContain('remaining life');
        expect(html).not.toContain('Cycle 3');
      }
    }
  });
  test('final comparison has exact source totals independently of cursor', () => {
    const html = comparison(heldOut);
    expect(html).toContain('Final outcomes'); expect(html).toContain('11.00'); expect(html).toContain('7.00'); expect(html).toContain('3.02');
  });
  test('guided beats come from events, including actual denials', () => {
    for (const policy of heldOut.policies) {
      const beats = storyBeats(policy);
      expect(beats).toHaveLength(5);
      expect(policy.trace.some(e => e.period === beats[1].period && e.requested)).toBe(true);
      expect(policy.trace.some(e => e.period === beats[2].period && denied(e))).toBe(true);
      expect(beats[4].period).toBe(endPeriod(policy));
    }
  });
  test('decision log groups simultaneous outcomes and exposes engine inspection without future events', () => {
    const policy = extended.policies.find(p => p.id === 'sensor')!;
    const html = eventLog(reconstruct(extended, policy, 18), policy);
    expect(html.match(/<h3>Period 18/g)).toHaveLength(1);
    expect(html).toContain('Denied, then failed');
    expect(html).toContain('data-log-engine="201"');
    expect(html).toContain('data-log-engine="202"');
    expect(html).not.toContain('Period 30');
    expect(html).not.toContain('data-log-engine="203"');
  });
});

describe('reject corrupted or incomplete data', () => {
  const bad = (mutate: (r: Replay) => void, message: string) => {
    const r = clone(); mutate(r); expect(() => validateReplay(r)).toThrow(message);
  };
  test('unknown version', () => bad(r => { (r as any).schemaVersion = 2; }, 'schema version'));
  test('duplicate engine metadata', () => bad(r => { r.engines.push(r.engines[0]); }, 'engine ID'));
  test('duplicate trace record', () => bad(r => { r.policies[0].trace.splice(1, 0, r.policies[0].trace[0]); }, 'duplicate'));
  test('missing record inside engine history', () => bad(r => { r.policies[0].trace.splice(0, 1); }, 'missing'));
  test('missing terminal outcome', () => bad(r => { r.policies[0].trace.pop(); }, 'terminal'));
  test('event after terminal state', () => bad(r => {
    const terminal = r.policies[0].trace.find(e => e.engineId === 101 && e.chosenAction === 'replace')!;
    r.policies[0].trace.push({ ...terminal, period: 10, cycle: 4 });
  }, 'after termination'));
  test('capacity violation even if cost and consequences are coherent', () => bad(r => {
    const t = r.policies[0].trace.find(e => e.engineId === 102 && e.period === 3)!;
    t.chosenAction = 'replace'; t.consequence = 'planned_replacement'; t.cost = 1;
  }, 'capacity violation'));
  test('non-risk policy with fabricated zero risk', () => bad(r => { r.policies[0].trace[0].estimatedRisk = 0; }, 'null risk'));
  test('NaN sensor', () => bad(r => { r.engines[0].observations[0].sensors[0] = Number.NaN; }, 'observation'));
  test('impossible failure timing', () => bad(r => { r.policies[0].trace[0].consequence = 'unexpected_failure'; }, 'consequence'));
  test('summary mismatch', () => bad(r => { r.policies[0].summary.totalCost += 1; }, 'reconciliation'));
  test('incorrect slot accrual', () => bad(r => { r.policies[0].summary.offeredSlots += 2; }, 'offeredSlots'));
  test('invalid structured rules', () => bad(r => { r.policies[0].rule = { kind: 'fixed', interval: 0 }; }, 'interval'));
  test('mismatched held-out identities', () => {
    const r = clone(heldOut); r.scenario.heldOutEngineIds.pop(); expect(() => validateReplay(r)).toThrow('held-out fleet');
  });
});
