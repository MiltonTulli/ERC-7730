# @erc7730/sdk

TypeScript **runtime** for [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear signing.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Docs:** [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/) (API reference is generated from exports).

This package is **not** a descriptor catalog. Pin [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry) by commit SHA. Authoring CLI: [`@erc7730/cli`](https://www.npmjs.com/package/@erc7730/cli) (separate package, independent version).

## Install

```bash
npm install @erc7730/sdk
# optional peer
npm install viem
```

| Entry | Use |
| --- | --- |
| `@erc7730/sdk` | Full runtime (registers Sourcify loader on import; `useSourcifyFallback` defaults to `false`) |
| `@erc7730/sdk/lite` | Decode / trust / resolve without Sourcify registration or `generateDescriptor` |
| `@erc7730/sdk/viem` | `decodeViemTransaction` / `decodeViemTypedData` |

## Quick start

```typescript
import {
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({
  pin: '9f37816afde954ff6617fb5baa346133e5af26c5',
});

const result = await decodeTransaction(tx, {
  registry,
  trust: officialOnlyPolicy(),
});

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.source, result.confidence, result.trust.accepted);
```

Production: `officialOnlyPolicy()` or `attestedPolicy()`. Sourcify / `generateDescriptor` are never `confidence: "high"` under official-only. Clear signing is not ABI pretty-printing.

Wallet walkthrough (prefetch, `ExternalDataProvider`, batch, UserOp): [`docs/GUIDE.md`](../../docs/GUIDE.md) or the [site guide](https://miltontulli.github.io/ERC-7730/guide/). Trust table: [site /trust](https://miltontulli.github.io/ERC-7730/trust/). Generated API: [site /sdk/api](https://miltontulli.github.io/ERC-7730/sdk/api/).

## Schema

SDK 0.x reads v1 and validates v1/v2. Package versions are independent of the ERC-7730 schema version.

## License

MIT
