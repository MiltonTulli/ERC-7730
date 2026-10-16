# @erc7730/sdk

The safest way to show a transaction to a human in TypeScript.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Docs:** [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/) (API reference is generated from exports).

## Install

```bash
npm install @erc7730/sdk
```

`viem` is an optional peer used only by `@erc7730/sdk/attest`. Keccak is `@noble/hashes` and the ABI codec is `ox`. Import `attestedPolicy` from `@erc7730/sdk/attest` and install `viem` only for that entry. `decodeViemTypedData` stays on the root and does not require `viem` at runtime.

| Entry | Use |
| --- | --- |
| `@erc7730/sdk` | Runtime. Sourcify is not in this entry. `useSourcifyFallback` defaults to `false` and does nothing until the call passes a loader. `decodeViemTypedData` lives here |
| `@erc7730/sdk/attest` | `attestedPolicy`. Requires the optional peer `viem@^2.21.0` |
| `@erc7730/sdk/generate` | `generateDescriptor` and the infer helpers. Authoring, not the decode runtime |
| `@erc7730/sdk/sourcify` | `fetchFromSourcify`, `isVerifiedOnSourcify`, and `sourcifyVerifiedAbiLoader({ fetch, baseUrl })` |
| `@erc7730/sdk/known-data` | `knownDataProvider()`. Curated tokens and contract names. The root entry does not apply them |

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

WETH `deposit()` on mainnet. `clearSign` uses the registry pinned to the commit shipped with the SDK. `officialOnlyPolicy()` is the default when `trust` is omitted.

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

Expected output: headline `Wrap`, verification `verified`, then `official-registry high true`. An explicit pin plus `decodeTransaction` is in [`docs/GUIDE.md`](../../docs/GUIDE.md) under Advanced.

## Production

Name the registry `pin` at the call site. With no network, pass `indexes` and `cache`. ERC-20, ERC-721, and WETH builtins fill in when no registry descriptor matches. `officialOnlyPolicy()` rejects that source, so confidence stays `low`.

What this toolkit is not: [not this](https://miltontulli.github.io/ERC-7730/not-this/). Upgrading notes: [Migrating from 0.x to 1.0](../../docs/migrating-to-1.0.md).

## Schema

SDK 0.x decodes v1 and v2 descriptors, and `validateDescriptor` accepts v1 and v2. Package versions are independent of the ERC-7730 schema version.

## Developing

Source imports are extensionless. Build and typecheck notes: [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT
