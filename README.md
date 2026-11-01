# Maintenance test floor

A standalone TypeScript and Three.js replay of the maintenance decision lab. The default 30-period toy demonstration spreads observations and maintenance decisions across a longer replay. The original held-out evaluation and a compact mechanics fixture remain selectable. Each trajectory represents one engine life, which ends at replacement or failure.

## Run locally

Requires Bun and a modern browser. Node.js 20 or newer and Git are needed only when regenerating data.

```powershell
bun install
bun run dev
```

Open http://127.0.0.1:5173/. Port 5173 is strict. The app starts paused and uses only local assets. Installation and normal use require no upstream checkout. The app is maintained in the standalone `jesco-tan/maintenance-test-floor` repository.

```powershell
bun run check
bun run test
```

`check` runs TypeScript without emitting files. `test` runs focused replay, accounting, presentation-boundary, and corruption tests. The `build` and `preview` scripts exist for future use. A production build has not been run.

## What is included

- Play, pause, previous/next period, range seeking, and 0.5x/1x/2x speed. Normal speed advances one calendar period per second.
- Policy switching that pauses and retains the current period, clamped to the new trace's end.
- Scenario switching that pauses and resets to period zero.
- A shared deterministic state for the spatial floor, fleet register, inspector, allocation board, metrics, and event log.
- Stable engine positions, constrained orbit and zoom, selection, camera reset, and bounded event lighting transitions.
- An event-driven guided replay and final comparison with cost bars and an accessible table.
- Observed sensor and score histories limited to the cursor or the end of an engine's life.
- Locally hosted IBM Plex Sans. Font license: [public/fonts/OFL.txt](public/fonts/OFL.txt).
- Useful text replay when WebGL is unavailable or loses its context.

The floor represents current slot allocation, with no persistent maintenance queue or repair-duration model. A denied request is an annotation for that period. It can coexist with failure at the end of the same period. Terminal engines remain retired in place.

## Data and reproduction

Source: https://github.com/jesco-tan/maintenance-decision-lab

Pinned commit: `1aa807e4b5a2c987abc414147f540e9d88b6b8f9`.

The local source checkout used during implementation is ignored under `.source/maintenance-decision-lab`. It is not needed to serve the app and is not part of the application repository. The adapter imports and runs the source simulator and evaluator directly. It does not copy or recreate their policy logic, model fitting, calibration, tuning, or allocation logic. No upstream edits were needed.

To regenerate with an explicit checkout:

```powershell
git clone https://github.com/jesco-tan/maintenance-decision-lab.git .source/maintenance-decision-lab
git -C .source/maintenance-decision-lab checkout 1aa807e4b5a2c987abc414147f540e9d88b6b8f9
bun run export -- .source/maintenance-decision-lab
```

Skip cloning if that checkout already exists. Export refuses a different commit or tracked modifications to source, configuration, or input fixtures. It runs the source evaluator, matches constructor-generated policy identifiers against a structured parameter catalog, attaches the original toy sensor observations, reconciles event accounting with source summaries, and validates both exports before writing them. It rejects unrecognized selected rules rather than guessing parameters from a name.

The provenance includes the source revision, input SHA-256, fixture name, command, dataset classification, and generation timestamp. The timestamp changes on export; all other exported content is deterministic with the pinned source. The adapter exports all three fixtures and can write evaluation reports inside the supplied source checkout's ignored `outputs/` directory.

### Extended toy replay (default)

`public/data/extended.json` is a deliberately constructed 30-period demonstration, not a held-out evaluation. Three unique engine lives (201, 202, 203) start in periods 1, 6, and 13. Every period contains real simulator decision records, with observations and terminal events extending through period 30 for each policy. No idle padding or repeated engine copies are added.

The source simulator runs fixed-cycle replacement at local cycle 18, a sensor threshold of 0.7, and a demonstration risk-score threshold of 0.6. Risk scores are prescribed squared sensor values, not calibrated probabilities. The sensor policy shows simultaneous contention and a same-period denied request and failure. The final engine ends in period 30. This increases replay duration at the original one-period-per-second speed.

Supporting explanations are collapsed under policy details, cost accounting, comparison notes, and provenance. The fleet register uses aligned status labels and whole-row pointer selection with keyboard buttons. The log groups outcomes by calendar period and links each engine to its inspector.

### Held-out toy fleet

`public/data/held-out.json` contains exactly engines 6, 5, and 3 from the source's 12 self-authored lives, split seed 23. Six lives train the model; separate validation lives calibrate it and tune the rules. Only the three held-out lives are displayed. Risk horizon is the current cycle and the next cycle.

Default assumptions: one slot per active decision period; replacement cost 1; failure cost 5; discarded-life cost 0.01 per observed cycle. All costs are dimensionless scenario assumptions.

| Policy | Source rule | Replacements | Failures | Discarded cycles | Final cost |
| --- | --- | ---: | ---: | ---: | ---: |
| Fixed cycle | fixed-6 | 1 | 2 | 0 | 11.00 |
| Sensor threshold | sensor-1-high-0.65 | 2 | 1 | 0 | 7.00 |
| Calibrated risk | risk-0.2 | 3 | 0 | 2 | 3.02 |

Each default trace contains one denied request. The fixed and sensor traces contain same-period denied requests and failures. Policy priority and allocation rank are not exported, so the UI explains allocation outcomes without claiming to reconstruct a ranking.

### Mechanics demonstration

`public/data/mechanics.json` uses three deliberately constructed lives defined in the adapter, with IDs 101, 102, and 103. The source simulator generates all traces. This fixture demonstrates a capacity denial with same-period failure, replacement at the final cycle with zero discarded life, staggered starts, and empty calendar periods. Its risk scores are prescribed readings passed through the source risk-policy constructor, not a trained or calibrated model. The interface labels this distinction.

### Integrity and reuse

Every loaded fixture is validated at runtime. Validation rejects duplicate IDs or records, gaps in local cycles, impossible period relationships, events after termination, missing terminal outcomes, inconsistent costs, invalid/null risk values, capacity violations, and mismatched source summaries. Retrospective terminal metadata lives outside observation histories. Static JSON is inspectable, so this is a presentation boundary rather than a secrecy guarantee.

No NASA files or NASA-derived results are included. No root source license was present at the pinned commit. Provenance and source links are retained. No broader upstream license is inferred or granted here.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/data/` | Typed contract, runtime validation, and loading |
| `src/replay/` | Pure cursor reconstruction, accounting, and story beats |
| `src/scene/` | Shared engine geometry, picking, board, rendering, resource disposal |
| `src/ui/views.ts` | Inspector, log, and comparison content |
| `src/main.ts` | App lifecycle, playback, and DOM controls |
| `src/styles/` | Tokens, responsive layout, focus, and motion preferences |
| `scripts/export-replay.ts` | Pinned source adapter |
| `tests/replay.test.ts` | Source accounting, deterministic seeking, and invalid data cases |

## Verification and remaining evidence

See [VERIFICATION.md](VERIFICATION.md) for completed checks and the manual verification checklist. Desktop/phone frame-rate and compressed production transfer targets have not been measured. No reference hardware was supplied. The app caps pixel ratio at 1.5, uses shared geometry, disables shadows on narrow screens, disposes resources, and renders on demand, with a bounded 280 ms event transition. Reduced motion makes state changes immediate. Backgrounding pauses playback.

Release 1.1 capacity/cost presets and NASA scenarios are intentionally outside this implementation. Vite uses relative asset paths for a future project-path deployment. GitHub Pages deployment is configured below.


## GitHub Pages

Repository: https://github.com/jesco-tan/maintenance-test-floor

Live project site: https://jesco-tan.github.io/maintenance-test-floor/

The workflow in `.github/workflows/pages.yml` installs the locked dependencies, runs type checks and replay tests, builds Vite assets with the Pages project base path, and uploads and deploys `dist`. It requires no source checkout or data regeneration.

Deployment is manual: in GitHub Actions, select **Deploy GitHub Pages**, then **Run workflow** on `main`. This runs a production build. Automatic builds on push are intentionally disabled. Pages must use **GitHub Actions** as its publishing source.

The local planning document is ignored and excluded from published Git history. Only the application branch is pushed; internal workspace checkpoint refs are not published.
