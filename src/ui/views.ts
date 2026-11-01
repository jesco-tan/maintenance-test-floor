import type { Replay, Policy, Trace } from '../data/schema';
import type { State } from '../replay/state';
import { denied } from '../replay/metrics';

export const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const number = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
export function ruleText(policy: Policy, replay: Replay) {
  const rule = policy.rule;
  if (rule.kind === 'fixed') return `Request at local cycle ${rule.interval} or later.`;
  if (rule.kind === 'sensor') return `Request when ${replay.sensorLabels[rule.sensorIndex]} ${rule.direction > 0 ? '≥' : '≤'} ${rule.threshold}.`;
  if (replay.provenance.classification === 'mechanics demonstration') return `Request at demonstration score ≥ ${rule.threshold}. These prescribed scores are not calibrated probabilities.`;
  return `Request at risk ≥ ${Math.round(rule.threshold * 100)}%. Risk is the probability of failure within the current cycle and the following ${replay.scenario.riskHorizon - 1} cycle(s).`;
}
export function outcome(event: Trace) {
  const action = event.requested ? event.chosenAction === 'replace' ? 'Request allocated' : 'Request denied' : 'No request';
  const consequence = event.consequence === 'unexpected_failure' ? 'Failed at end of period' : event.consequence === 'planned_replacement' ? 'Life ended by replacement' : 'Continued operating';
  return `${action}. ${consequence}.`;
}
export function eventTitle(event: Trace) {
  if (denied(event)) return event.consequence === 'unexpected_failure' ? 'Denied, then failed' : 'Request denied';
  if (event.consequence === 'planned_replacement') return 'Replaced';
  if (event.consequence === 'unexpected_failure') return 'Failed';
  return 'Operating';
}
export function inspector(replay: Replay, policy: Policy, engine: State['engines'][number]) {
  const readings = engine.observations;
  const sensorIndex = policy.rule.kind === 'sensor' ? policy.rule.sensorIndex : 0;
  const values = readings.map(o => o.sensors[sensorIndex]);
  const current = engine.current;
  const last = engine.history.at(-1);
  const risk = last?.estimatedRisk;
  const scoreLabel = replay.provenance.classification === 'mechanics demonstration' ? 'Demonstration score' : 'Current horizon risk';
  const chart = values.length ? sparkline(values) : '<p class="empty">No observations yet. Advance the replay to reveal a reading.</p>';
  return `<div class="inspector-heading"><span>Engine ${engine.id}</span><span class="status ${engine.status.replace(' ', '-')}">${escape(engine.status)}</span></div>
    <dl class="engine-facts"><div><dt>Local cycle</dt><dd>${engine.cycle}</dd></div><div><dt>${policy.rule.kind === 'risk' ? scoreLabel : 'Latest toy sensor'}</dt><dd>${policy.rule.kind === 'risk' ? risk == null ? 'Unavailable' : `${number(risk * 100)}%` : values.length ? number(values.at(-1)!) : 'Unavailable'}</dd></div></dl>
    <p class="decision">${current ? escape(eventTitle(current)) : engine.status === 'not started' ? 'Awaiting start' : `Life ended in period ${last?.period}`}</p>
    <h3>Sensor history</h3>${chart}
    <details id="observations"><summary>Readings and decisions (${engine.history.length})</summary><div class="table-scroll"><table><caption class="sr-only">Observed history for engine ${engine.id}</caption><thead><tr><th scope="col">Period</th><th scope="col">Age</th><th scope="col">Sensor</th><th scope="col">Score</th><th scope="col">Decision</th></tr></thead><tbody>${engine.history.map(e => `<tr><td>${e.period}</td><td>${e.cycle}</td><td>${number(readings.find(o => o.cycle === e.cycle)!.sensors[sensorIndex])}</td><td>${e.estimatedRisk == null ? 'Not used' : number(e.estimatedRisk)}</td><td>${escape(outcome(e))}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function sparkline(values: number[]) {
  const min = Math.min(0, ...values); const max = Math.max(1, ...values); const span = max - min || 1;
  const points = values.map((v, i) => `${20 + i / Math.max(1, values.length - 1) * 260},${90 - (v - min) / span * 68}`).join(' ');
  return `<svg class="sensor-chart" viewBox="0 0 300 116" role="img" aria-label="Observed sensor trend. Exact values are in the readings table."><path d="M20 15V90H280" fill="none" stroke="#a9b9c4"/><polyline points="${points}" fill="none" stroke="#2457c5" stroke-width="2.5"/>${values.map((v, i) => `<circle cx="${20 + i / Math.max(1, values.length - 1) * 260}" cy="${90 - (v - min) / span * 68}" r="3" fill="#2457c5"/>`).join('')}<text x="20" y="109">Cycle 1</text><text x="235" y="109">${values.length}</text></svg>`;
}
export function eventLog(state: State, policy: Policy) {
  const events = policy.trace.filter(e => e.period <= state.period && (e.requested || e.consequence !== 'operating'));
  const periods = [...new Set(events.map(e => e.period))].reverse();
  return events.length ? `<div class="event-groups">${periods.map(period => `<section class="event-period ${period === state.period ? 'current-period' : ''}"><h3>Period ${period}${period === state.period ? '<span>Current</span>' : ''}</h3><ul class="events">${events.filter(e => e.period === period).map(e => `<li class="${e.consequence === 'unexpected_failure' ? 'event-failed' : denied(e) ? 'event-denied' : 'event-replaced'}"><button class="event-engine" data-log-engine="${e.engineId}" aria-label="Inspect engine ${e.engineId}">Engine ${e.engineId}</button><strong>${escape(eventTitle(e))}</strong><span class="event-cost">${number(e.cost)} cost</span></li>`).join('')}</ul></section>`).join('')}</div>` : '<p class="empty">No decisions yet.</p>';
}
export function comparison(replay: Replay) {
  const max = Math.max(1, ...replay.policies.map(p => p.summary.totalCost));
  const chart = replay.policies.map(p => {
    const c = p.summary.costBreakdown;
    return `<div class="comparison-row"><span>${escape(p.label)}</span><div class="cost-track" aria-hidden="true"><i class="cost-planned" style="width:${c.planned / max * 100}%"></i><i class="cost-failure" style="width:${c.unexpectedFailure / max * 100}%"></i><i class="cost-unused" style="width:${c.unusedLife / max * 100}%"></i></div><strong>${number(p.summary.totalCost)}</strong></div>`;
  }).join('');
  return `<div class="section-title"><div><h2>Final outcomes</h2><p>Full-run totals on the same fleet and assumptions.</p></div></div>
    <div class="comparison-layout"><div><div role="img" aria-label="Stacked cost comparison. Exact values are provided in the table.">${chart}</div><div class="legend"><span><i class="cost-planned"></i>Replacement</span><span><i class="cost-failure"></i>Failure</span><span><i class="cost-unused"></i>Discarded life</span></div></div>
    <div class="table-scroll"><table><caption>Dimensionless cost breakdown</caption><thead><tr><th scope="col">Policy</th><th scope="col">Replace</th><th scope="col">Fail</th><th scope="col">Discard</th><th scope="col">Total</th></tr></thead><tbody>${replay.policies.map(p => `<tr><th scope="row">${escape(p.label)}</th><td>${number(p.summary.costBreakdown.planned)}</td><td>${number(p.summary.costBreakdown.unexpectedFailure)}</td><td>${number(p.summary.costBreakdown.unusedLife)}</td><td><strong>${number(p.summary.totalCost)}</strong></td></tr>`).join('')}</tbody></table></div></div>
    <details class="comparison-notes"><summary>About this comparison</summary><p class="muted">${replay.provenance.classification === 'held-out toy evaluation' ? 'Rules were tuned separately from the held-out fleet.' : 'Rules and risk scores in this mechanics demonstration are deliberately prescribed, with no model evaluation.'} Costs are toy assumptions, not measured aircraft savings. Results can change under other assumptions.</p></details>`;
}
