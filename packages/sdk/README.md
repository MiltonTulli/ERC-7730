# @erc7730/sdk

The safest way to show a transaction to a human in TypeScript.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Docs:** [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/) (API reference is generated from exports).

## Install

```bash
npm install @erc7730/sdk
```

`viem` is not a dependency of this package. Keccak is `@noble/hashes` and the ABI codec is `ox`. Import `attestedPolicy` from `@erc7730/sdk/attest` and install `viem` only for that entry. `decodeViemTypedData` stays on the root and does not require `viem` at runtime.

| Entry | Use |
| --- | --- |
| `@erc7730/sdk` | Runtime. Sourcify is opt-in (`loadVerifiedAbi: sourcifyVerifiedAbiLoader` and `useSourcifyFallback: true`). Import does not fetch. `useSourcifyFallback` defaults to `false`. `decodeViemTypedData` lives here |
| `@erc7730/sdk/attest` | `attestedPolicy`. This entry can depend on `viem` |

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

What this toolkit is not: [not this](https://miltontulli.github.io/ERC-7730/not-this/). Upgrading notes: [`docs/GUIDE.md`](../../docs/GUIDE.md).

## Schema

SDK 0.x decodes v1 and v2 descriptors, and `validateDescriptor` accepts v1 and v2. Package versions are independent of the ERC-7730 schema version.

## Developing

Source imports are extensionless. Build and typecheck notes: [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT
