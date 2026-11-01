import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateReplay, type Replay, type Rule } from '../src/data/schema';

const source = process.argv[2];
if (!source) throw new Error('Usage: bun run export -- <path-to-pinned-source-checkout>');
const root = resolve(source);
const pinned = '1aa807e4b5a2c987abc414147f540e9d88b6b8f9';
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== pinned) throw new Error(`Export requires source commit ${pinned}`);
execFileSync('git', ['-C', root, 'diff', '--exit-code', 'HEAD', '--', 'src', 'config', 'tests/fixtures'], { stdio: 'pipe' });
const moduleAt = (name: string) => import(pathToFileURL(join(root, 'src/maintenance', name + '.js')).href);
const policies = await moduleAt('policies');
const { simulate } = await moduleAt('simulator');
const { loadToy } = await moduleAt('data');
execFileSync('node', ['src/maintenance/evaluate.js'], { cwd: root, stdio: 'pipe' });
const report = JSON.parse(await readFile(join(root, 'outputs/report.json'), 'utf8'));
const config = JSON.parse(await readFile(join(root, 'config/default.json'), 'utf8'));
const toyInput = await readFile(join(root, 'tests/fixtures/toy-lives.json'), 'utf8');
const lives = await loadToy(join(root, 'tests/fixtures/toy-lives.json'));
const comparison = report.comparisons.find((c: any) => Object.keys(config).filter(k => k.endsWith('Cost') || k === 'slotsPerCycle' || k === 'unusedLifeCostPerCycle').every(k => c.assumptions[k] === config[k]));
if (!comparison) throw new Error('Default comparison is missing');

// Match constructor-generated identifiers to a structured parameter catalog.
// No parsing of display names, no reimplementation of source tuning or policy logic.
const catalog = new Map<string, Rule>();
for (const interval of [3, 4, 5, 6, 7, 8]) catalog.set(policies.fixedInterval(interval).name, { kind: 'fixed', interval });
for (const threshold of [0.35, 0.45, 0.55, 0.65, 0.75, 0.85]) {
  const { index: sensorIndex, direction } = report.selectedSensor;
  catalog.set(policies.sensorThreshold(threshold, sensorIndex, direction).name, { kind: 'sensor', sensorIndex, direction, threshold });
}
for (const threshold of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) catalog.set(policies.learnedRisk(null, threshold).name,
  { kind: 'risk', threshold, model: report.model.type });
const labels: Record<string, string> = { fixed: 'Fixed cycle', sensor: 'Sensor threshold', risk: 'Calibrated risk' };
function summaryOf(result: any) {
  return Object.fromEntries(['totalCost', 'planned', 'failures', 'unusedLife', 'usedSlots', 'offeredSlots', 'utilization', 'costBreakdown'].map(key => [key, result[key]])) as Replay['policies'][number]['summary'];
}
function base(group: any[], classification: Replay['provenance']['classification'], input: string): Omit<Replay, 'policies' | 'scenario'> {
  return { schemaVersion: 1, provenance: {
    repository: 'https://github.com/jesco-tan/maintenance-decision-lab', commit: pinned,
    fixture: classification === 'held-out toy evaluation' ? 'tests/fixtures/toy-lives.json' : 'scripts/export-replay.ts: mechanics lives',
    command: 'bun run export -- <source-checkout>', generatedAt: new Date().toISOString(), classification,
    inputSha256: createHash('sha256').update(input).digest('hex'),
    notes: classification === 'held-out toy evaluation' ? 'Three held-out lives from the source split. Rules tuned on separate validation engines. No NASA data. No allocation ranks exported.' : 'Constructed edge cases, not held-out evaluation. Risk values are prescribed demonstration scores, not a calibrated model.',
  }, sensorLabels: ['Toy sensor 1 (unitless)'],
    engines: group.map(life => ({ id: life.id, observations: life.rows.map((row: any) => ({ cycle: row.cycle, sensors: row.sensors })) })),
    retrospective: group.map(life => ({ engineId: life.id, failureCycle: life.rows.length })),
  };
}
const group = report.engineIds.test.map((id: number) => lives.find((life: any) => life.id === id));
const heldOut: Replay = { ...base(group, 'held-out toy evaluation', toyInput),
  scenario: { id: 'held-out-default', label: 'Held-out toy fleet', splitSeed: report.splitSeed, riskHorizon: report.riskHorizon,
    ...comparison.assumptions, startCycles: report.startCycles.heldOutTest, heldOutEngineIds: report.engineIds.test },
  policies: comparison.results.filter((p: any) => p.kind !== 'oracle').map((p: any) => {
    const rule = catalog.get(p.policy);
    if (!rule) throw new Error(`Unrecognized selected rule: ${p.policy}`);
    return { id: p.kind, label: labels[p.kind], sourceName: p.policy, rule, trace: report.traces[p.kind], summary: summaryOf(p) };
  }),
};
const mechanicsInput = [{ id: 101, start: 1, sensorSeries: [0.1, 0.4, 0.9] },
  { id: 102, start: 1, sensorSeries: [0.1, 0.4, 0.9] }, { id: 103, start: 6, sensorSeries: [0.1, 0.4, 0.7, 0.9] }];
const mechanicsLives = mechanicsInput.map(e => ({ id: e.id, rows: e.sensorSeries.map((v, i) => ({ cycle: i + 1, sensors: [v], settings: [0, 0, 0] })) }));
const scenario = { id: 'mechanics', label: 'Mechanics demonstration', splitSeed: 23, riskHorizon: 2,
  replacementCost: 1, failureCost: 5, unusedLifeCostPerCycle: 0.01, slotsPerCycle: 1,
  startCycles: Object.fromEntries(mechanicsInput.map(e => [e.id, e.start])), heldOutEngineIds: [] };
const mechanicsRules: Rule[] = [{ kind: 'fixed', interval: 3 }, { kind: 'sensor', sensorIndex: 0, direction: 1, threshold: 0.7 },
  { kind: 'risk', threshold: 0.7, model: 'Prescribed demonstration scores, not calibrated probabilities' }];
const mechanicsPolicies = [policies.fixedInterval(3), policies.sensorThreshold(0.7), policies.learnedRisk({ predict: (history: any[]) => history.at(-1).sensors[0] }, 0.7)];
const mechanics: Replay = { ...base(mechanicsLives, 'mechanics demonstration', JSON.stringify(mechanicsInput)), scenario,
  policies: mechanicsPolicies.map((policy: any, i: number) => { const result = simulate(mechanicsLives, policy, scenario); const id = ['fixed', 'sensor', 'risk'][i];
    return { id, label: id === 'risk' ? 'Risk score demo' : labels[id], sourceName: policy.name, rule: mechanicsRules[i], trace: result.trace, summary: summaryOf(result) }; }),
};
// A longer, separately labeled demonstration. No extra wall-clock padding or copied engines.
// Staggered starts spread observations and policy decisions across 30 calendar periods.
const extendedInput = [
  { id: 201, start: 1, sensorSeries: Array.from({ length: 18 }, (_, i) => i === 17 ? 0.75 : 0.05 + i * 0.032) },
  { id: 202, start: 6, sensorSeries: Array.from({ length: 20 }, (_, i) => i >= 12 ? 0.9 + (i - 12) * 0.01 : 0.05 + i * 0.045) },
  { id: 203, start: 13, sensorSeries: Array.from({ length: 18 }, (_, i) => i === 17 ? 0.9 : 0.04 + i * 0.03) },
];
const extendedLives = extendedInput.map(e => ({ id: e.id, rows: e.sensorSeries.map((value, i) => ({ cycle: i + 1, sensors: [value], settings: [0, 0, 0] })) }));
const extendedScenario = { ...scenario, id: 'extended', label: 'Extended toy replay', startCycles: Object.fromEntries(extendedInput.map(e => [e.id, e.start])) };
const extendedRules: Rule[] = [{ kind: 'fixed', interval: 18 }, { kind: 'sensor', sensorIndex: 0, direction: 1, threshold: 0.7 },
  { kind: 'risk', threshold: 0.6, model: 'Prescribed squared-sensor demonstration scores, not calibrated probabilities' }];
const extendedPolicies = [policies.fixedInterval(18), policies.sensorThreshold(0.7), policies.learnedRisk({ predict: (history: any[]) => history.at(-1).sensors[0] ** 2 }, 0.6)];
const extended: Replay = { ...base(extendedLives, 'mechanics demonstration', JSON.stringify(extendedInput)), scenario: extendedScenario,
  policies: extendedPolicies.map((policy: any, i: number) => {
    const result = simulate(extendedLives, policy, extendedScenario); const id = ['fixed', 'sensor', 'risk'][i];
    return { id, label: id === 'risk' ? 'Risk score demo' : labels[id], sourceName: policy.name, rule: extendedRules[i], trace: result.trace, summary: summaryOf(result) };
  }),
};
await mkdir('public/data', { recursive: true });
for (const [file, replay] of [['extended', extended], ['held-out', heldOut], ['mechanics', mechanics]] as const) {
  validateReplay(replay);
  await writeFile(`public/data/${file}.json`, JSON.stringify(replay, null, 2) + '\n');
  console.log(`${file}: ${replay.engines.length} engines; ` + replay.policies.map(p => `${p.id} cost ${p.summary.totalCost}, denials ${p.trace.filter(e => e.requested && e.chosenAction === 'continue').length}`).join('; '));
}
