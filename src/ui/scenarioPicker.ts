import type { Replay } from '../data/schema';
import { endPeriod } from '../replay/state';

const choices = [
  { id: 'extended', title: 'Learn the basics',
    description: 'Follow a longer replay, then try another policy.', kind: 'Toy demonstration' },
  { id: 'held-out', title: 'Compare tested policies',
    description: 'Use toy engines kept out of model training.', kind: 'Held-out evaluation' },
  { id: 'mechanics', title: 'Explore a capacity clash',
    description: 'See what happens when two engines need one slot.', kind: 'Toy demonstration' },
];

export function scenarioPicker(selected: string, replays: ReadonlyMap<string, Replay>) {
  return `<fieldset class="scenario-picker"><legend>Choose a replay</legend><div class="scenario-options">${choices.map(choice => {
    const replay = replays.get(choice.id)!;
    const periods = Math.max(...replay.policies.map(endPeriod));
    return `<label class="scenario-option"><input type="radio" name="scenario" value="${choice.id}" ${selected === choice.id ? 'checked' : ''} aria-describedby="scenario-description-${choice.id}"><span class="scenario-option-body"><span class="scenario-option-heading"><strong>${choice.title}</strong>${choice.id === 'extended' ? '<span class="recommended">Start here</span>' : ''}</span><span class="scenario-description" id="scenario-description-${choice.id}">${choice.description}</span><span class="scenario-meta">${periods} periods / ${choice.kind}</span></span></label>`;
  }).join('')}</div></fieldset>`;
}
