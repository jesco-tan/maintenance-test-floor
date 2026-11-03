import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './styles/app.css';
import { loadReplay } from './data/loadReplay';
import { reconstruct, clampPeriod, endPeriod, storyBeats } from './replay/state';
import { denied } from './replay/metrics';
import { escape, number, inspector, eventLog, comparison, ruleText } from './ui/views';
import type { createScene } from './scene/createScene';
import type { Replay } from './data/schema';
import { scenarioPicker } from './ui/scenarioPicker';
import { policyPicker } from './ui/policyPicker';

const app = document.querySelector<HTMLElement>('#app')!;
let cleanup: (() => void) | undefined;
let generation = 0;
let selectedEngine: number | undefined;
let request: AbortController | undefined;
const cachedReplays = new Map<string, Replay>();

async function boot(file = 'extended', focusChoice = false) {
  const run = ++generation;
  request?.abort(); request = new AbortController(); cleanup?.(); cleanup = undefined;
  app.innerHTML = '<p class="loading" role="status">Loading and validating the replay...</p>';
  try {
    if (!cachedReplays.size) {
      const files = ['extended', 'held-out', 'mechanics'];
      const fixtures = await Promise.all(files.map(name => loadReplay(name, request!.signal)));
      if (run !== generation) return;
      files.forEach((name, index) => cachedReplays.set(name, fixtures[index]));
    }
    const loadedReplay = cachedReplays.get(file);
    if (!loadedReplay) throw new Error('The selected replay does not exist.');
    const replay: Replay = loadedReplay;
    if (run !== generation) return;
    let policy = replay.policies[0];
    let period = 0; let playing = false; let speed = 1; let timer: ReturnType<typeof setTimeout> | undefined;
    let storyIndex = -1; let scene: ReturnType<typeof createScene> | undefined;
    let selected = replay.engines.some(e => e.id === selectedEngine) ? selectedEngine! : replay.engines[0].id;
    const demo = replay.provenance.classification === 'mechanics demonstration';
    app.innerHTML = `
      <header class="masthead"><a class="wordmark" href="./" aria-label="Maintenance test floor home"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="4"/><path d="M16 4v8m12 4h-8m-4 12v-8M4 16h8M7.5 7.5l6 6m11-6l-6 6m6 11l-6-6m-11 6l6-6"/></svg>Maintenance decision lab</a><a href="https://github.com/jesco-tan/maintenance-decision-lab" target="_blank" rel="noopener noreferrer">View source ↗</a></header>
      <section class="intro"><div><h1>Several engines need attention.<br>Only one can be replaced this cycle.</h1><p>Compare three policies on the same toy fleet.</p></div><button id="guide" class="secondary">Walk me through it <span aria-hidden="true">↗</span></button></section>
      ${scenarioPicker(file, cachedReplays)}
      <div class="scenario-strip"><span>${replay.engines.length} engines</span><span>1 service slot / period</span><span>Failure cost 5 / replacement cost 1</span></div>
      ${demo ? `<p class="dataset-note">${file === 'extended' ? '30-period constructed toy demonstration.' : 'Constructed mechanics demonstration.'} Scores are prescribed, not calibrated probabilities. No NASA data or NASA-derived results.</p>` : ''}
      <section class="policy-strip">${policyPicker(replay, policy.id)}<details class="policy-help"><summary>Selected policy details</summary><p id="rule"></p></details></section>
      <section class="story" id="story" hidden aria-label="Guided replay"><div><strong id="story-step"></strong><p id="story-copy"></p></div><div class="story-actions"><button id="story-prev">Back</button><button id="story-next">Next</button><button id="story-close" aria-label="Close guided replay">Close</button></div></section>
      <div class="replay-layout"><section class="floor-panel" aria-labelledby="floor-title"><div class="floor-heading"><h2 id="floor-title">Test floor</h2><span id="period-tag">Period 0</span><button id="reset-camera" class="quiet">Reset view</button></div><div id="scene"><p class="scene-loading">Preparing the 3D floor...</p></div><p id="graphics-message" role="status" hidden></p><div class="floor-caption"><span>Drag to orbit / scroll to zoom</span></div>
      <div class="allocation" aria-live="polite"><strong>Current allocation</strong><span id="allocation"></span></div>
      <div id="controls" class="playback" tabindex="-1"><div class="playback-buttons"><button id="play" class="primary">Play replay</button><button id="previous" aria-label="Previous period">←</button><button id="next" aria-label="Next period">→</button></div><label class="speed-label">Speed <select id="speed"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select></label><button id="compare" class="quiet">Compare policies ↓</button><label class="timeline-label" for="timeline"><span>Calendar period</span><output id="cursor" for="timeline"></output></label><input id="timeline" type="range" min="0" value="0" step="1" aria-label="Calendar period at end of period"/></div></section>
      <aside class="inspector-panel" aria-labelledby="inspector-title"><div class="inspector-top"><h2 id="inspector-title">Engine inspector</h2></div><div id="inspector"></div></aside></div>
      <section class="metrics" aria-label="Cumulative outcomes"><div><span>Total cost</span><strong id="metric-cost"></strong></div><div><span>Failures</span><strong id="metric-failures"></strong></div><div><span>Planned replacements</span><strong id="metric-planned"></strong></div><div><span>Operating now</span><strong id="metric-operating"></strong></div><div><span>Slot utilization</span><strong id="metric-utilization"></strong></div><div><span>Discarded cycles</span><strong id="metric-unused"></strong></div></section>
      <details class="accounting-note"><summary>How costs are counted</summary><p>Costs are dimensionless assumptions. Discarded cycles are retrospective outcomes, unavailable to the policy, charged at 0.01 per cycle. Utilization counts only periods with active decisions.</p></details>
      <div class="records-layout"><section class="fleet-panel"><div class="records-heading"><h2>Fleet register</h2><span>${replay.engines.length} engines</span></div><div class="table-scroll"><table><caption class="sr-only">Fleet state at the current calendar period</caption><thead><tr><th scope="col">Engine</th><th scope="col">Status</th><th scope="col">Age</th><th scope="col">This period</th></tr></thead><tbody>${replay.engines.map(e => `<tr id="engine-${e.id}" data-engine-row="${e.id}"><th scope="row"><button data-engine="${e.id}" aria-pressed="false">Engine ${e.id}</button></th><td><span class="status" data-cell="status"></span></td><td data-cell="cycle"></td><td data-cell="decision"></td></tr>`).join('')}</tbody></table></div></section><section class="log-panel"><details id="event-details" open><summary><span>Decision log</span><span id="event-count"></span></summary><div id="event-log"></div></details></section></div>
      <section id="comparison" class="comparison-panel" tabindex="-1" hidden>${comparison(replay)}</section>
      <details class="methods"><summary>Assumptions, provenance, and reproduction</summary><div class="methods-content"><p>Replacement is allocated before end-of-cycle failure. A denied request may fail in the same period. Every trajectory ends at replacement or failure and never returns to service. Requests are per-period annotations, with no persistent queue or repair duration.</p><p>Policy priorities and allocation rank are not exported. Acceptance and denial are shown without reconstructing a ranked rationale. True terminal cycles are kept in separate retrospective metadata and are never used to color an operating engine.</p><p>Costs are dimensionless scenario assumptions. The facility is illustrative. No real safety outcome, downtime, or economic saving is modeled. Utilization is used slots / offered slots, excluding empty periods.</p><p>${escape(replay.provenance.notes)}</p><dl><div><dt>Classification</dt><dd>${escape(replay.provenance.classification)}</dd></div><div><dt>Source commit</dt><dd><a href="https://github.com/jesco-tan/maintenance-decision-lab/tree/${replay.provenance.commit}" target="_blank" rel="noopener noreferrer">${replay.provenance.commit}</a></dd></div><div><dt>Fixture</dt><dd>${escape(replay.provenance.fixture)}</dd></div><div><dt>Split seed / risk horizon</dt><dd>${replay.scenario.splitSeed} / ${replay.scenario.riskHorizon} cycles</dd></div><div><dt>Generated</dt><dd>${escape(replay.provenance.generatedAt)}</dd></div></dl><p>Regenerate locally with <code>bun run export -- &lt;source-checkout&gt;</code>. <a href="${import.meta.env.BASE_URL}data/${file}.json" download>Download validated replay JSON</a>.</p><p>Simulator and toy data: maintenance-decision-lab. IBM Plex Sans is locally hosted under the SIL Open Font License.</p></div></details>
      <footer><span>Maintenance test floor / <a href="${import.meta.env.BASE_URL}fonts/OFL.txt">Font license</a></span><span>Toy data / Dimensionless costs</span></footer><p id="announcement" class="sr-only" role="status" aria-live="polite"></p>`;
    const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
    if (focusChoice) app.querySelector<HTMLInputElement>('input[name="scenario"]:checked')?.focus({ preventScroll: true });
    const listen = (id: string, event: string, handler: EventListener) => el(id).addEventListener(event, handler);
    function pause() { playing = false; clearTimeout(timer); timer = undefined; }
    function render(animate = false) {
      const state = reconstruct(replay, policy, period); period = state.period;
      el('rule').textContent = ruleText(policy, replay);
      el('period-tag').textContent = `Period ${period}`; el('cursor').textContent = `${period} / ${endPeriod(policy)}`;
      el<HTMLInputElement>('timeline').max = String(endPeriod(policy)); el<HTMLInputElement>('timeline').value = String(period);
      el<HTMLButtonElement>('previous').disabled = period === 0; el<HTMLButtonElement>('next').disabled = period === endPeriod(policy);
      el('play').textContent = playing ? 'Pause replay' : period === endPeriod(policy) ? 'Replay' : 'Play replay';
      el('play').setAttribute('aria-pressed', String(playing));
      const m = state.metrics;
      for (const [id, value] of Object.entries({ cost: number(m.totalCost), failures: m.failures, planned: m.planned, operating: state.operating,
        utilization: m.utilization === null ? 'Unavailable' : `${Math.round(m.utilization * 100)}%`, unused: m.unusedLife })) el(`metric-${id}`).textContent = String(value);
      const requests = state.events.filter(e => e.requested);
      el('allocation').textContent = requests.length ? requests.map(e => `Engine ${e.engineId}: ${denied(e) ? 'denied' : 'allocated'}${e.consequence === 'unexpected_failure' ? ', failed' : ''}`).join('; ') : 'No requests this period.';
      for (const engine of state.engines) {
        const row = el(`engine-${engine.id}`);
        const status = row.querySelector<HTMLElement>('[data-cell="status"]')!;
        status.textContent = engine.status.charAt(0).toUpperCase() + engine.status.slice(1);
        status.className = `status ${engine.status.replace(' ', '-')}`;
        row.querySelector('[data-cell="cycle"]')!.textContent = String(engine.cycle);
        row.querySelector('[data-cell="decision"]')!.textContent = !engine.current ? engine.status === 'not started' ? 'Awaiting start' : 'Life ended' : denied(engine.current) ? `Denied${engine.status === 'failed' ? ', failed' : ''}` : engine.current.requested ? 'Allocated' : engine.status === 'failed' ? 'Failed' : 'No request';
        row.querySelector('button')!.setAttribute('aria-pressed', String(engine.id === selected));
        row.classList.toggle('selected-row', engine.id === selected);
      }
      const observationsOpen = el<HTMLDetailsElement>('observations')?.open ?? false;
      const readingFocus = el('observations')?.contains(document.activeElement);
      el('inspector').innerHTML = inspector(replay, policy, state.engines.find(e => e.id === selected)!);
      el<HTMLDetailsElement>('observations').open = observationsOpen;
      if (readingFocus) el('observations').querySelector('summary')?.focus({ preventScroll: true });
      const focusedLogEngine = document.activeElement?.getAttribute('data-log-engine');
      el('event-log').innerHTML = eventLog(state, policy);
      if (focusedLogEngine) el('event-log').querySelector<HTMLButtonElement>(`[data-log-engine="${focusedLogEngine}"]`)?.focus({ preventScroll: true });
      const eventCount = policy.trace.filter(e => e.period <= period && (e.requested || e.consequence !== 'operating')).length;
      el('event-count').textContent = `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`;
      el('announcement').textContent = `Period ${period}. ${m.planned} replacements, ${m.failures} failures. ${el('allocation').textContent}`;
      scene?.update(state, selected, animate);
    }
    function seek(value: number) { pause(); period = clampPeriod(policy, value); render(); }
    function scheduleNext() {
      timer = setTimeout(() => {
        period++;
        if (period >= endPeriod(policy)) pause();
        render(true);
        if (playing) scheduleNext();
      }, 1000 / speed);
    }
    function start() {
      clearTimeout(timer); playing = true;
      render();
      scheduleNext();
    }
    function select(id: number) { selected = id; selectedEngine = id; render(); }
    function showComparison() { el('comparison').hidden = false; el('comparison').focus({ preventScroll: true }); el('comparison').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
    function showBeat(index: number) {
      storyIndex = Math.max(0, Math.min(4, index)); const beat = storyBeats(policy)[storyIndex];
      if (beat.engineId) { selected = beat.engineId; selectedEngine = selected; }
      el('story').hidden = false; el('story-step').textContent = `Step ${storyIndex + 1} of 5`;
      el('story-copy').textContent = beat.text; el<HTMLButtonElement>('story-prev').disabled = storyIndex === 0;
      el('story-next').textContent = storyIndex === 4 ? 'Finish' : 'Next';
      seek(beat.period); if (storyIndex === 4) showComparison();
    }
    listen('play', 'click', () => { if (playing) { pause(); render(); } else { if (period === endPeriod(policy)) period = 0; start(); } });
    listen('previous', 'click', () => seek(period - 1)); listen('next', 'click', () => seek(period + 1));
    listen('timeline', 'input', () => seek(Number(el<HTMLInputElement>('timeline').value)));
    listen('speed', 'change', () => { speed = Number(el<HTMLSelectElement>('speed').value); if (playing) start(); });
    app.querySelectorAll<HTMLInputElement>('input[name="policy"]').forEach(input => input.addEventListener('change', () => {
      if (!input.checked) return;
      pause(); policy = replay.policies.find(p => p.id === input.value)!;
      period = clampPeriod(policy, period); el('story').hidden = true; storyIndex = -1; render();
    }));
    app.querySelectorAll<HTMLInputElement>('input[name="scenario"]').forEach(input => input.addEventListener('change', () => {
      if (input.checked) { selectedEngine = selected; void boot(input.value, true); }
    }));
    listen('reset-camera', 'click', () => scene?.reset()); listen('compare', 'click', showComparison);
    listen('guide', 'click', () => showBeat(0)); listen('story-prev', 'click', () => showBeat(storyIndex - 1));
    listen('story-next', 'click', () => { if (storyIndex === 4) el('story').hidden = true; else showBeat(storyIndex + 1); });
    listen('story-close', 'click', () => { el('story').hidden = true; el('guide').focus(); });
    app.querySelector('.fleet-panel')!.addEventListener('click', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-engine-row]');
      if (row) select(Number(row.dataset.engineRow));
    });
    listen('event-log', 'click', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-log-engine]');
      if (button) select(Number(button.dataset.logEngine));
    });
    const visibility = () => { if (document.hidden) { pause(); render(); } }; document.addEventListener('visibilitychange', visibility);
    const graphicsFallback = (message: string) => { el('graphics-message').hidden = false; el('graphics-message').textContent = message; el('scene').hidden = true; el<HTMLButtonElement>('reset-camera').disabled = true; };
    cleanup = () => { pause(); document.removeEventListener('visibilitychange', visibility); scene?.dispose(); };
    render();
    try {
      const { createScene } = await import('./scene/createScene');
      if (run !== generation) return;
      scene = createScene(el('scene'), replay, select, graphicsFallback);
      app.querySelector('.scene-loading')?.remove(); render();
    } catch (error) { if (run === generation) graphicsFallback('The 3D floor is unavailable. The complete replay, fleet register, and inspector remain usable below.'); console.info('Graphics fallback:', error); }
  } catch (error) {
    if (run !== generation || (error instanceof DOMException && error.name === 'AbortError')) return;
    app.innerHTML = `<section class="error"><h1>The replay could not open</h1><p role="alert">${escape(error instanceof Error ? error.message : error)}</p><p>Data must pass validation before playback can begin.</p><button id="retry">Retry loading</button></section>`;
    document.getElementById('retry')?.addEventListener('click', () => void boot(file));
  }
}
void boot();
window.addEventListener('pagehide', () => { ++generation; request?.abort(); cleanup?.(); });
window.addEventListener('pageshow', e => { if (e.persisted) void boot(); });
if (import.meta.hot) import.meta.hot.dispose(() => { ++generation; request?.abort(); cleanup?.(); });
