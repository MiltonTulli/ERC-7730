# Roadmap

Tracker: [#2](https://github.com/MiltonTulli/ERC-7730/issues/2). That issue is the checklist. This file is the version chain.

North star: one production wallet on `officialOnlyPolicy()`.

Public one-liner: the safest way to show a transaction to a human in TypeScript.

## How versions chain

Do not open the next minor until the previous exit criteria are green. Patches anytime. At most one minor per week. 0.10 is the only breaking minor in this cycle.

| Version | Milestone | Closes | Issues |
|---|---|---|---|
| 0.9.1 patch | M0 Honesty | Declared contract matches what ships. No API change. | [#89](https://github.com/MiltonTulli/ERC-7730/issues/89) [#90](https://github.com/MiltonTulli/ERC-7730/issues/90) [#91](https://github.com/MiltonTulli/ERC-7730/issues/91) [#92](https://github.com/MiltonTulli/ERC-7730/issues/92) [#93](https://github.com/MiltonTulli/ERC-7730/issues/93) |
| 0.10 minor | M1 Honest contract | Real result types, `officialOnlyPolicy()` default, builtins never `high`, no process-global state, `/lite` and `/viem` removed. | [#94](https://github.com/MiltonTulli/ERC-7730/issues/94)–[#105](https://github.com/MiltonTulli/ERC-7730/issues/105) |
| 0.11 minor | M2 Product | `clearSign`, diagnostics, `toScreens`, one wallet fork. | [#106](https://github.com/MiltonTulli/ERC-7730/issues/106)–[#111](https://github.com/MiltonTulli/ERC-7730/issues/111) |
| 0.12 minor | M3 Small API | ~25 root exports, perf, `erc7730 test`. Start only after 0.11 is in a wallet fork. | [#112](https://github.com/MiltonTulli/ERC-7730/issues/112)–[#122](https://github.com/MiltonTulli/ERC-7730/issues/122) |
| 1.0 major | M4 Stable | No `@deprecated`. Written viem and CJS decisions. A real wallet in production. | [#123](https://github.com/MiltonTulli/ERC-7730/issues/123)–[#127](https://github.com/MiltonTulli/ERC-7730/issues/127) |
| post 1.0 | M5 Adoption | Listing, coverage dashboard, benches, adapters. | [#128](https://github.com/MiltonTulli/ERC-7730/issues/128)–[#131](https://github.com/MiltonTulli/ERC-7730/issues/131) |

## Decisions

- `viem` becomes a real dependency in 0.9.1 ([#89](https://github.com/MiltonTulli/ERC-7730/issues/89)). Extracting it from the core waits until a wallet asks ([#124](https://github.com/MiltonTulli/ERC-7730/issues/124)).
- `@erc7730/sdk/lite` and `@erc7730/sdk/viem` are removed in 0.10 ([#105](https://github.com/MiltonTulli/ERC-7730/issues/105)). `lite` is deprecated and is not a smaller graph. `decodeViemTransaction` is an alias. `decodeViemTypedData` moves to the root.
- CJS / React Native stays parked ([#70](https://github.com/MiltonTulli/ERC-7730/issues/70), decision in [#125](https://github.com/MiltonTulli/ERC-7730/issues/125)).
- Listing next to Sourcify TS / Rust waits for the wallet case study and `erc7730 test` ([#69](https://github.com/MiltonTulli/ERC-7730/issues/69), [#128](https://github.com/MiltonTulli/ERC-7730/issues/128)).

## Exit criteria

- **0.9.1:** clean install imports the package; a known `transfer` does not print `Param 1`; README claims nothing false; disclosure channel exists.
- **0.10:** exported `DecodedField` is the runtime type; a call with no options does not return `policy: 'unspecified'`; `/lite` and `/viem` are gone.
- **0.11:** README quick start is `clearSign`; five failure reasons assert a diagnostic code; a wallet case study covers its 20 most common transactions.
- **1.0:** zero `@deprecated` in `dist/index.d.ts`; an external wallet in production on `officialOnlyPolicy()`.

## Shipped

- 0.2 spec and pinned registry
- 0.3 signing runtime
- 0.4 CLI and `@erc7730/sdk/viem` (entry removed in 0.10)
- 0.5 wallet drop-in ([#53](https://github.com/MiltonTulli/ERC-7730/issues/53))
- 0.6 coverage, policies, authoring ([#54](https://github.com/MiltonTulli/ERC-7730/issues/54))
- 0.7–0.9 published 2026-10-05, each breaking. Current: 0.9.0

## First PRs

[#89](https://github.com/MiltonTulli/ERC-7730/issues/89), [#90](https://github.com/MiltonTulli/ERC-7730/issues/90), [#91](https://github.com/MiltonTulli/ERC-7730/issues/91)+[#92](https://github.com/MiltonTulli/ERC-7730/issues/92), [#93](https://github.com/MiltonTulli/ERC-7730/issues/93), then [#95](https://github.com/MiltonTulli/ERC-7730/issues/95).

## Keep

OIDC + provenance + cosign release, golden tests against `python-erc7730`, tarball smoke, TypeDoc, changesets, `noExplicitAny`.
