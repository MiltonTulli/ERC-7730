# @erc7730/sdk

TypeScript **runtime** for [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear signing.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Docs:** [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/) (API reference is generated from exports).

This package is **not** a descriptor catalog, and the published tarball does not include one. `createOfficialRegistry()` defaults to the vendored commit SHA of [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Production wallets should still pass an explicit `pin`. With no network, pass `indexes` and `cache`. ERC-20, ERC-721, and WETH builtins stay as local fallbacks. Authoring CLI: [`@erc7730/cli`](https://www.npmjs.com/package/@erc7730/cli) (separate package, independent version).

## Install

```bash
npm install @erc7730/sdk
# optional peer
npm install viem
```

| Entry | Use |
| --- | --- |
| `@erc7730/sdk` | Full runtime. Sourcify is opt-in (`enableSourcifyAbiLoader` or `loadVerifiedAbi`); import does not register a loader. `useSourcifyFallback` defaults to `false` |
| `@erc7730/sdk/lite` | Deprecated narrower entry. Same install. Omits the Sourcify client and `generateDescriptor` from that graph. Not how descriptors are loaded |
| `@erc7730/sdk/viem` | `decodeViemTransaction` / `decodeViemTypedData` (does not register a Sourcify loader) |

## Quick start

```typescript
import {
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
  VENDORED_REGISTRY_COMMIT,
} from '@erc7730/sdk';

// Defaults to VENDORED_REGISTRY_COMMIT (a commit SHA), not master.
const registry = createOfficialRegistry();

// Production: pass an explicit pin.
// const registry = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT });
// Local floating ref only: createOfficialRegistry({ ref: 'master' })

const result = await decodeTransaction(tx, {
  registry,
  trust: officialOnlyPolicy(),
});

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.source, result.confidence, result.trust.accepted);
console.log('default pin', VENDORED_REGISTRY_COMMIT);
```

Production: `officialOnlyPolicy()` or `attestedPolicy()`, and an explicit `pin`. Sourcify / `generateDescriptor` are never `confidence: "high"` under official-only. Clear signing is not ABI pretty-printing.

Wallet walkthrough (prefetch, `ExternalDataProvider`, batch, UserOp): [`docs/GUIDE.md`](../../docs/GUIDE.md) or the [site guide](https://miltontulli.github.io/ERC-7730/guide/). Trust table: [site /trust](https://miltontulli.github.io/ERC-7730/trust/). Generated API: [site /sdk/api](https://miltontulli.github.io/ERC-7730/sdk/api/).

## Schema

SDK 0.x reads v1 and validates v1/v2. Package versions are independent of the ERC-7730 schema version.

## Developing

Source imports are extensionless. Build and typecheck notes: [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT
