# Runtime compatibility

The [module and runtime support matrix](https://miltontulli.github.io/ERC-7730/guide/#module-and-runtime-support) is maintained in `docs/GUIDE.md`. `packages/docs/scripts/include-canonical.mjs` copies the same matrix into both READMEs, the site home, and the SDK overview, and fails on drift. Edit the guide, run the script, then commit the refreshed copies.

## Consumer and packaging checks

The package minimum is Node `>=20`. CI checks the packed SDK on Node 20, 22, and 24, independently of the Node `>=22.18.0` required to build the repository. Node 22 and 24 receive the full build and test suite. Node 20 receives consumer checks only; this is not a promise to run repository tooling there. Use current patch releases: the current `@noble/hashes` dependency declares Node `>=20.19.0`.

From the repository root, after installing dependencies:

```bash
pnpm --filter @erc7730/sdk build
node scripts/sdk-consumer-install.mjs
pnpm --filter @erc7730/sdk exec publint
pnpm --filter @erc7730/sdk exec attw --pack . --profile esm-only
```

The consumer check packs the SDK and installs the tarball into a temporary ESM project outside the workspace. It derives entries from the installed `exports` map so new public subpaths cannot be silently omitted. It checks:

- Root, `/generate`, `/sourcify`, and `/known-data` runtime imports and TypeScript declarations with no `viem` installed.
- `/attest` fails with a missing `viem` module before the optional peer is installed; every entry imports and typechecks after installing `viem@^2.21.0`.
- TypeScript `NodeNext` and `Bundler` resolution, with dependency declaration checking enabled (`skipLibCheck: false`).
- Imports make no `fetch` requests; `viem` remains optional and is not installed by the base package.

The check prints the exact Node, TypeScript, and installed `viem` versions in its output. CI's **Consumer install** jobs retain this evidence for each Node line. The **Build & Test** jobs run publint and attw. The attw `esm-only` profile ignores `node10` and CommonJS resolution failures; a passing result certifies the documented ESM profile, not `require()` or legacy `node10` resolution.

Browser coverage is the **SDK browser goldens** step in CI's **Playground** job: Vite bundles the built SDK for Playwright Chromium and checks the committed transaction and typed-data screens. Run it locally with:

```bash
pnpm --filter @erc7730/sdk exec playwright install chromium
pnpm --filter @erc7730/sdk test:browser
```

## CJS decision and issue #70

[Issue #70](https://github.com/MiltonTulli/ERC-7730/issues/70) is an integrator-demand gate, not a commitment to ship CJS or React Native support. [Issue #125](https://github.com/MiltonTulli/ERC-7730/issues/125) records the decision to keep ESM-only. No named integrator or reproducible CJS import blocker is recorded in either issue. A dual build is not planned without that evidence and agreement on its scope.

The old `/lite` and `/viem` entries mentioned in #70 were removed by [#105](https://github.com/MiltonTulli/ERC-7730/issues/105); future compatibility work targets the root and the current public subpaths. The root registers no network loader on import. CJS and React Native are separate decisions: a CJS build would not establish RN support.

## React Native evidence required

React Native remains **unverified**. There is no supported RN adapter or example in this change. Before making a support claim, record a reproducible Metro build and a successful device or emulator runtime smoke test, together with exact React Native and Metro versions, platform, configuration, any polyfills, and the public entries exercised. An ESM import or Metro flag alone does not meet that bar.
