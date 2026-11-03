# Validation

I checked the constructed replay against its source-compatible fixtures. All 34 Bun tests and the TypeScript check passed. The tests cover accounting, event timing, capacity constraints, replay state and rejection of inconsistent data.

I kept the browser scenarios separate from the independently reproduced FD001 analysis and its extended operational simulator. The browser retains its immediate-action teaching mechanics and contains no NASA data.

## Scope

The toy replay explains decisions under constructed assumptions; it does not validate real failure probabilities or establish measured maintenance savings. These checks do not constitute a new browser or deployment verification. See [README.md](README.md) for the scenario contract and the companion analytical report for FD001 results and operational sensitivity.
