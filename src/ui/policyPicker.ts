import type { Replay } from '../data/schema';
import { escape } from './views';

export function policyPicker(replay: Replay, selected: string) {
  const demo = replay.provenance.classification === 'mechanics demonstration';
  return `<fieldset class="policy-picker"><legend>Choose a maintenance policy</legend><div class="scenario-options">${replay.policies.map(policy => {
    const rule = policy.rule;
    const description = rule.kind === 'fixed' ? 'Replace once an engine reaches a set age.'
      : rule.kind === 'sensor' ? 'Replace when a sensor reading crosses its limit.'
      : demo ? 'Replace when an illustrative score crosses its limit.'
      : 'Replace when estimated failure risk crosses its limit.';
    const detail = rule.kind === 'fixed' ? `From local cycle ${rule.interval}`
      : rule.kind === 'sensor' ? `Sensor ${rule.sensorIndex + 1} ${rule.direction > 0 ? '≥' : '≤'} ${rule.threshold}`
      : demo ? 'Demo scores, not predicted probabilities'
      : `Looks ahead ${replay.scenario.riskHorizon} cycles, including this one`;
    return `<label class="scenario-option"><input type="radio" name="policy" value="${escape(policy.id)}" ${selected === policy.id ? 'checked' : ''} aria-describedby="policy-description-${escape(policy.id)}"><span class="scenario-option-body"><span class="scenario-option-heading"><strong>${escape(policy.label)}</strong>${rule.kind === 'fixed' ? '<span class="recommended">Simplest rule</span>' : ''}</span><span class="scenario-description" id="policy-description-${escape(policy.id)}">${description}</span><span class="scenario-meta">${escape(detail)}</span></span></label>`;
  }).join('')}</div></fieldset>`;
}
