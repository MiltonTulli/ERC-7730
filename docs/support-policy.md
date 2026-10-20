# Support policy

This policy covers the published `@erc7730/sdk` and `@erc7730/cli` packages. They are versioned and released independently. The web playground, documentation site, and private registry fixtures are not published packages.

## Versions and compatibility

From 1.0 onward, each package follows strict semantic versioning: breaking public API or documented behavior changes require a major release, backward-compatible features use a minor, and compatible fixes use a patch. Package versions do not identify the ERC-7730 schema version. Review changelogs for observable decoding, warning, and screen changes as well as TypeScript API changes.

Before 1.0, minor releases may introduce breaking API or behavior changes; there is no two-minor deprecation guarantee on 0.x. Patch releases are for compatible corrections. The removals planned for SDK 1.0 are listed in [Migrating to 1.0](./migrating-to-1.0.md).

## Deprecations from 1.0

A deprecated API remains available through at least two subsequent minor releases and is removed only in a major release. For example, an API deprecated in 1.2 remains available throughout 1.3 and 1.4; removal can occur in 2.0 only after those minor releases have shipped. Deprecations identify the replacement and migration path in API documentation and release notes.

Security exception: when retaining an API would expose users to a vulnerability, a security fix may disable the vulnerable behavior before that window expires. Use a compatible mitigation where possible; removal or an incompatible public contract change still requires a major. The advisory and release notes explain affected versions, the reason for the exception, and migration or mitigation steps. The normal deprecation window is not a reason to leave a vulnerability exploitable.

## Which release line receives fixes

For each package, maintenance and security fixes target the latest stable minor line of its current stable major, delivered in that line's latest patch. Consumers should update to that patch. Older minors and historical majors have no promised backports or ongoing security updates. Before 1.0, this means the latest stable 0.x minor line.

When a new stable major ships, it becomes the maintained major for that package and the previous major's maintenance ends. An SDK release does not change the CLI's maintained line unless the CLI itself releases. An npm `next` prerelease is for opt-in candidate testing; it does not replace the stable support line or carry a separate long-term maintenance promise.

Stable minor/major releases preferably ship no more than once per week to reduce integration churn. This is a recommendation, not a hard limit or a promise of weekly releases; maintainers may publish earlier after reviewed candidate promotion and all mandatory release checks. Corrective and security patches can ship whenever needed. Candidates publish only under `next`; stable releases use `latest`. See [RELEASE.md](../RELEASE.md) for promotion, independent versioning, changelog guidance, and emergency patches.

## Runtime minimum, tested environments, and supported environments

The [guide's runtime matrix](./GUIDE.md#module-and-runtime-support) is the canonical matrix shared by the READMEs and site entry pages. The [compatibility page](./runtime-compatibility.md) describes the checks and optional dependencies.

| Category | Commitment / evidence |
| --- | --- |
| Node package minimum | Published SDK and CLI declare Node `>=20`. Use a current patch release; the SDK's current `@noble/hashes` dependency requires `>=20.19.0`. An engine minimum is not a support promise for every Node release above it. |
| Tested Node lines | CI runs SDK packed-consumer imports and type checks on Node 20, 22, and 24. Node 22 and 24 run the full repository build/test suite, including SDK and CLI. Node 20 receives SDK consumer checks only. |
| Actively supported Node LTS lines | Node 22 and 24 with current patches. Node 20's consumer coverage does not make it an actively supported line. Newer Node majors are not automatically supported merely because they satisfy `engines`. |
| Repository build minimum | Node `>=22.18.0`, separate from the published package minimum. |
| Browser SDK scope | Modern ESM browser bundlers targeting ES2022, including BigInt; network operations require `fetch`. Evidence is TypeScript Bundler resolution and Vite/Playwright Chromium screen goldens. This is not a promise to test every browser/version or support legacy browsers. The CLI runs on Node. |
| CommonJS | Unsupported; packages are ESM only. Runtime-supported asynchronous `import()` can be used from a CJS application. |
| React Native / Metro | Unverified, with no support claim until a reproducible Metro build and device/emulator smoke test are recorded. |

Only `@erc7730/sdk/attest` requires the optional peer `viem@^2.21.0`. The root, `/generate`, `/sourcify`, and `/known-data` do not. Consult the compatibility page before selecting module tooling or an untested environment.

## Maintenance and security reports

This is a maintainer-led open-source project. The commitment is to maintain the current release lines above, review reproducible reports, and publish fixes through the documented release process. There is no guaranteed general bug-fix turnaround, commercial support SLA, or maintenance commitment for historical branches.

Report vulnerabilities privately using [SECURITY.md](../SECURITY.md). Its existing commitments are acknowledgment within **72 hours** and assessment within **14 days**; these are response commitments, not a guaranteed fix deadline. Descriptor vulnerabilities in the official registry belong to that repository's reporting process. Reproducible non-security package issues can be filed in [this repository](https://github.com/MiltonTulli/ERC-7730/issues).
