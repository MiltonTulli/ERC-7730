# Roadmap

Tracker: [#2](https://github.com/MiltonTulli/ERC-7730/issues/2).

## Published baseline

- SDK [1.0.0](https://github.com/MiltonTulli/ERC-7730/releases/tag/sdk-v1.0.0) and CLI [0.5.0](https://github.com/MiltonTulli/ERC-7730/releases/tag/cli-v0.5.0) are stable, released on 2026-10-16.
- Promotion: [#177](https://github.com/MiltonTulli/ERC-7730/pull/177). Successful publication recovery: [workflow attempt 2](https://github.com/MiltonTulli/ERC-7730/actions/runs/38934782520/attempts/2).
- 1.0 is a stable public API and support commitment, not evidence of external production adoption. See [support policy](./docs/support-policy.md), [migration guide](./docs/migrating-to-1.0.md), and [release process](./RELEASE.md).
- M0–M4 implementation is complete. The historical 0.9.1 → 1.0 checklist remains in #2; planned milestone versions were not exact release contents. M3 improvements were delivered across 0.12 and 1.0.

## Next work

| Work | Issue | Scope / priority |
| --- | --- | --- |
| Easy integration | [#131](https://github.com/MiltonTulli/ERC-7730/issues/131) | Buildable React example using the published SDK first. No new React package by default. |
| Ecosystem listing and feedback | [#128](https://github.com/MiltonTulli/ERC-7730/issues/128), [#69](https://github.com/MiltonTulli/ERC-7730/issues/69) | Prepare reproducible interop evidence and an accurate listing request; avoid duplicate requests. |
| External integration evidence | [#111](https://github.com/MiltonTulli/ERC-7730/issues/111) | The issue is closed, but the Ambire document is not an executable wallet fork and its three missing cases were not filed upstream. This remains an adoption objective, not a release gate. |
| Compatibility dashboard | [#129](https://github.com/MiltonTulli/ERC-7730/issues/129) | Separate descriptor resolution, differential cases, untested descriptors and divergences. Defer until useful to consumers. |
| Comparative benchmarks | [#130](https://github.com/MiltonTulli/ERC-7730/issues/130) | Equivalent work on pinned versions and an offline corpus; defer behind integration needs. |
| Optional environments/adapters | [#70](https://github.com/MiltonTulli/ERC-7730/issues/70), [#131](https://github.com/MiltonTulli/ERC-7730/issues/131) | CJS, ethers and React Native only for demonstrated consumer blockers. RN remains unverified. |

Adoption goal: one external production wallet on `officialOnlyPolicy()`. Start with a small executable example and real integrator feedback; do not treat a stable release or a documentation example as proof of adoption.

## Maintenance after 1.0

- Preserve semver, compatibility and migration commitments. Prefer weekly stable feature releases, but reviewed promotions may ship earlier. Corrective patches can ship when needed.
- Keep `main` and `next` synchronized after stable promotion, with candidate ancestry preserved. An idle `next` may contain already-published stable versions; start a new prerelease cycle only with applicable changesets.
- Publication recovery must distinguish npm metadata visibility from tarball availability. Retry bounded propagation states while failing on authentication, integrity or provenance errors.
- Keep OIDC/provenance, cosign verification, golden tests against `python-erc7730`, tarball and consumer smoke checks, API reports, TypeDoc and changesets.
- Do not create a new package release for workflow/documentation-only maintenance.

## Current design decisions

- Registry contributions belong upstream; the in-repo registry package is historical fixtures.
- Root SDK uses `ox` and `@noble/hashes`; `viem` is an optional peer only for `/attest`.
- Public entries: root, `/attest`, `/generate`, `/sourcify`, `/known-data`. `/lite`, `/viem` and `/legacy` were removed.
- `officialOnlyPolicy()` is the default. Descriptor acceptance is not a transaction-safety guarantee; nested call coverage must be presented explicitly.
- Public docs and issue/PR descriptions are in English.
