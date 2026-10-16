# ERC-7730

The safest way to show a transaction to a human in TypeScript.

[![npm sdk](https://img.shields.io/npm/v/@erc7730/sdk.svg?label=%40erc7730%2Fsdk)](https://www.npmjs.com/package/@erc7730/sdk)
[![npm cli](https://img.shields.io/npm/v/@erc7730/cli.svg?label=%40erc7730%2Fcli)](https://www.npmjs.com/package/@erc7730/cli)
[![ERC-7730](https://img.shields.io/badge/schema-v1%20%2B%20v2-3b82f6)](https://eips.ethereum.org/EIPS/eip-7730)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Docs:** [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/) · **Playground:** […/demo](https://miltontulli.github.io/ERC-7730/demo/)

## Install

```bash
npm install @erc7730/sdk
npm install -D @erc7730/cli
```

`viem` is an optional peer used only by `@erc7730/sdk/attest`. Keccak is `@noble/hashes` and the ABI codec is `ox`. Import `attestedPolicy` from `@erc7730/sdk/attest` and install `viem` only for that entry.

<!-- runtime-support:start -->
## Module and runtime support

`@erc7730/sdk` ships **ESM only**, including every public subpath.

| Environment | Status | Validation / requirements |
| --- | --- | --- |
| Node.js | Supported with ESM; package minimum `>=20` | CI runs clean consumer imports and type checks on Node 20, 22, and 24. Node 22 and 24 are the actively supported lines with full build/test coverage; Node 20 has consumer checks only. |
| Modern browser bundlers | Supported with ESM | TypeScript `moduleResolution: "bundler"` consumer checks and Vite/Chromium browser goldens. Requires ES2022 (including BigInt) and `fetch` for network operations. |
| CommonJS (`require`) | Unsupported | No CJS build or `exports.require`. A CommonJS app may use asynchronous `import()` if its runtime supports ESM. |
| React Native / Metro | **Unverified** | No reproducible Metro build and device/emulator runtime smoke test has been recorded. ESM compatibility or a Metro flag alone is not evidence of RN support. |

Use a current patch release within the Node line: the SDK declares `>=20`, while the current `@noble/hashes` dependency requires `>=20.19.0`. Building this repository requires Node `>=22.18.0`.

The public entries are `@erc7730/sdk`, `/attest`, `/generate`, `/sourcify`, and `/known-data`. Only `/attest` requires the **optional peer `viem@^2.21.0`** at runtime and for types. Install it explicitly when using that entry:

```bash
npm install @erc7730/sdk viem@^2.21.0
```

The other four entries install, import, and typecheck without `viem`, including the root's `decodeViemTypedData` helper.
More about packaging checks and the CJS/RN decision: [runtime compatibility](https://miltontulli.github.io/ERC-7730/sdk/compatibility/).
<!-- runtime-support:end -->

## Quick start

WETH `deposit()` on mainnet. `clearSign` uses the official registry pinned to the commit SHA shipped with the SDK. `officialOnlyPolicy()` is the default when `trust` is omitted.

<!-- quickstart:start -->
```ts
import { type TransactionInput, clearSign } from '@erc7730/sdk';

const tx = {
  to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  data: '0xd0e30db0',
  value: 10n ** 18n,
  chainId: 1,
} satisfies TransactionInput;

const signed = await clearSign(tx);

console.log(signed.screens.headline);
console.log(signed.screens.verification);
console.log(signed.source, signed.confidence, signed.trust.accepted);
```
<!-- quickstart:end -->

Expected output: headline `Wrap`, verification `verified`, then `official-registry high true`. Pin and `decodeTransaction` are in [docs/GUIDE.md](./docs/GUIDE.md) under Advanced.

## Production

Name the registry `pin` at the call site, as the snippet does. With no network, pass `indexes` and `cache`.

`officialOnlyPolicy()` accepts `official-registry` and `attested` only. ERC-20, ERC-721, and WETH builtins run when the registry has no match, and that policy keeps them at `confidence: "low"`.

`attestedPolicy` is imported from `@erc7730/sdk/attest`. `generateDescriptor` is `@erc7730/sdk/generate`. The Sourcify client is `@erc7730/sdk/sourcify`. Curated token and contract names are `knownDataProvider()` from `@erc7730/sdk/known-data`. The root entry does not apply that list.

What this toolkit is not: [not this](https://miltontulli.github.io/ERC-7730/not-this/).

## Packages

| Package | Role | npm |
| --- | --- | --- |
| [`@erc7730/sdk`](./packages/sdk/README.md) | Runtime: validate, pin the official registry, resolve, decode with `TrustPolicy` | [published](https://www.npmjs.com/package/@erc7730/sdk) |
| [`@erc7730/cli`](./packages/cli/README.md) | Authoring CLI (`erc7730` binary only) | [published](https://www.npmjs.com/package/@erc7730/cli) |
| `@erc7730/registry` | Historical snapshot / fixtures. Not a contribution target | private |
| `@erc7730/web` | Browser playground (mounted at `/demo` on Pages) | private |
| `@erc7730/docs` | Starlight docs site deployed to GitHub Pages | private |

`@erc7730/sdk` and `@erc7730/cli` are versioned and released independently (`sdk-v*` / `cli-v*` tags). See [RELEASE.md](./RELEASE.md). Direction: [ROADMAP.md](./ROADMAP.md) and tracker [#2](https://github.com/MiltonTulli/ERC-7730/issues/2). Authoring imports: [CONTRIBUTING.md](./CONTRIBUTING.md).

```bash
erc7730 generate --chain-id 1 --address 0x... --abi ./abi.json --owner "My Protocol"
erc7730 lint ./calldata.json
erc7730 test ./calldata.json --tests ./testsv2/calldata.tests.json
erc7730 preview --data 0x... --to 0x... --chain-id 1 --pin <sha>
```

The CLI does not open PRs against the official registry. Walkthrough: [CLI docs](https://miltontulli.github.io/ERC-7730/cli/).

## Schema compatibility

| Package line | ERC-7730 schema |
| --- | --- |
| SDK 0.x | Decodes v1 and v2 descriptors; `validateDescriptor` accepts v1 and v2 |
| CLI 0.x | Lints v1 and v2. `generate` writes a v2 draft |

## Links

- [EIP-7730](https://eips.ethereum.org/EIPS/eip-7730) · [clearsigning.org](https://clearsigning.org)
- Official registry · Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) · Sourcify clear-signing
- Wallet guide: [`docs/GUIDE.md`](./docs/GUIDE.md) · [site guide](https://miltontulli.github.io/ERC-7730/guide/) · [trust](https://miltontulli.github.io/ERC-7730/trust/)
- [Migrating from 0.x to 1.0](./docs/migrating-to-1.0.md)
- Interop: [`docs/interop.md`](./docs/interop.md) · Divergences: [`docs/divergences.md`](./docs/divergences.md)
- Security reports: [`SECURITY.md`](./SECURITY.md)
- [License](./LICENSE)

## Project structure

```
ERC-7730/
├── packages/
│   ├── sdk/       # @erc7730/sdk
│   ├── cli/       # @erc7730/cli
│   ├── docs/      # GitHub Pages site
│   ├── web/       # playground → /demo
│   └── registry/  # fixtures
├── docs/          # GUIDE, interop, divergences, github-action, snippets/quickstart.ts
├── RELEASE.md
└── ROADMAP.md
```
