# Verification record

Implementation date: 2 November 2026, Asia/Singapore.

## Completed

- Installed independent dependencies with Bun 1.3.14 and retained `bun.lock`.
- Confirmed source HEAD exactly matches the plan's pinned commit, with no upstream code changes.
- Ran the source evaluator and adapter, then validated and reconciled all three fixtures across all three policies.
- `bun run check`: passed TypeScript without emission.
- `bun run test`: 34 tests passed, including accounting for all three fixtures, the 30-period extended demonstration, grouped event presentation, denied-and-failed events, final-cycle replacement, empty periods, staggered starts, backward seeking, policy changes, null non-risk scores, observation boundaries, and malformed fixture rejection.
- `bun run dev`: started independently at http://127.0.0.1:5173/ with strict port 5173.
- HTTP smoke checks returned 200 for the entry page, Vite-transformed application and scene modules, and static replay data.
- Initialized a local Git repository. Dependencies, output, the source checkout, and the planning document are ignored. The application branch is prepared for a standalone repository; internal checkpoint refs are excluded from pushes.
- Retained IBM Plex Sans's SIL Open Font License in `public/fonts/OFL.txt`.

The first production build was subsequently authorized by the user and completed successfully in GitHub Actions. HTTP and TypeScript checks do not establish browser layout or graphics correctness.

## Manual checks still required

These are unverified, not passing claims:

- Use a browser at 375 px width, landscape, and desktop width; confirm controls and metrics remain reachable without horizontal page scrolling.
- Increase browser text zoom to 200%; inspect wrapping, timeline controls, comparison, and fleet register.
- Tab through all controls, select engines from the table, and compare selection with 3D picking. Inspect visible focus, reading order, range keys, and screen-reader announcements.
- Use every policy at the beginning, middle, and end; switch scenarios while playing; background and restore the tab; confirm pause, clamping, and reset behavior.
- Enable reduced motion and verify immediate state changes and no event lighting transition.
- Disable WebGL before loading, then separately trigger context loss; verify that controls, fleet register, inspector, and comparison stay usable.
- Supply malformed fixture JSON and check the readable error and retry action.
- Load all local assets, disconnect networking, and exercise the replay. All three validated fixtures are loaded into memory at startup, so scenario switching requires no further data fetch. A page reload while offline still depends on browser caching. There is no service worker or offline-install claim.
- Ask a new visitor to explain the capacity tradeoff after the guided replay.
- Measure frame rate on a named desktop and phone. Record device, operating system, browser/version, display size, and pixel ratio. Targets: near 60 fps desktop and at least 30 fps phone.
- After an explicitly requested production build, measure compressed initial app plus toy-data transfer. Target: under 2 MB excluding optional fonts.

## Reuse notes

Source provenance is retained. No broader source license or NASA permissions are inferred from public availability. Publication was explicitly requested by the repository owner.

## Pages preparation

A manual GitHub Actions workflow is configured to check, test, build, and deploy the site. It has no push trigger, so pushing source does not run a production build. The user explicitly authorized the production build. GitHub Actions run https://github.com/jesco-tan/maintenance-test-floor/actions/runs/41335035914 passed installation, type checks, all 34 tests, the production build, artifact upload, and deployment. The site is live at https://jesco-tan.github.io/maintenance-test-floor/.

Published-site HTTP checks returned 200 for the entry page, main JavaScript and CSS assets, and all three replay fixtures. The planning document returns 404, is ignored locally, and is absent from the published application branch history. Internal workspace checkpoint refs were not uploaded. Browser and device checks above remain unverified.
