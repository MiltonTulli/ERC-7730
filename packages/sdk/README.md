# @erc7730/sdk

TypeScript **runtime** for [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear signing.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Docs:** [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/) (API reference is generated from exports).

This package is **not** a descriptor catalog, and the published tarball does not include one. `createOfficialRegistry()` defaults to the vendored commit SHA of [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Production wallets should still pass an explicit `pin`. With no network, pass `indexes` and `cache`. ERC-20, ERC-721, and WETH builtins are the fallback when no registry matches. They are never `confidence: "high"` under `officialOnlyPolicy()`. Authoring CLI: [`@erc7730/cli`](https://www.npmjs.com/package/@erc7730/cli) (separate package, independent version).

## Install

```bash
npm install @erc7730/sdk
```

`viem` is not a dependency of this package. Keccak is `@noble/hashes` and the ABI codec is `ox`. Import `attestedPolicy` from `@erc7730/sdk/attest` and install `viem` only for that entry. `decodeViemTypedData` stays on the root and does not require `viem` at runtime.

| Entry | Use |
| --- | --- |
| `@erc7730/sdk` | Full runtime. Sourcify is opt-in (`loadVerifiedAbi: sourcifyVerifiedAbiLoader` and `useSourcifyFallback: true`). Import does not fetch. `useSourcifyFallback` defaults to `false`. `decodeViemTypedData` lives here |

`@erc7730/sdk/lite` and `@erc7730/sdk/viem` are removed. Use `decodeTransaction` instead of `decodeViemTransaction`.

## Quick start

### 1. Smallest call (intent + fields)

`createOfficialRegistry()` uses the vendored commit SHA. No policy yet:

```typescript
import { createOfficialRegistry, decodeTransaction } from '@erc7730/sdk';

const registry = createOfficialRegistry();

const result = await decodeTransaction(
  {
    to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    data: '0xd0e30db0',
    value: 10n ** 18n,
    chainId: 1,
  },
  { registry }
);

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.fields);
```

Illustrative summary: Wrap · 1 ETH · official-registry · high · accepted: true

### 2. Production (explicit pin + trust)

Same call with a frozen SHA and `officialOnlyPolicy()`. That policy rejects Sourcify / `generateDescriptor` / inferred / basic as high confidence:

```typescript
import {
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
  VENDORED_REGISTRY_COMMIT,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT });

const tx = {
  to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  data: '0xd0e30db0',
  value: 10n ** 18n,
  chainId: 1,
} as const;

const result = await decodeTransaction(tx, {
  registry,
  trust: officialOnlyPolicy(),
});

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.source, result.confidence, result.trust.accepted);
```

Clear signing is not ABI pretty-printing. Prefetch, `extend()`, `ExternalDataProvider` (token / ENS / NFT — the SDK does no RPC), batch, UserOp, and attestations: [`docs/GUIDE.md`](../../docs/GUIDE.md) or the [site guide](https://miltontulli.github.io/ERC-7730/guide/). Trust table: [site /trust](https://miltontulli.github.io/ERC-7730/trust/). Generated API: [site /sdk/api](https://miltontulli.github.io/ERC-7730/sdk/api/).

## Schema

SDK 0.x decodes v1 and v2 descriptors, and `validateDescriptor` accepts v1 and v2. Package versions are independent of the ERC-7730 schema version.

## Developing

Source imports are extensionless. Build and typecheck notes: [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT
