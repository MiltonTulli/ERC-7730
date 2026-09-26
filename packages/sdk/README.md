# @erc7730/sdk

TypeScript runtime for [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear signing. This is the library package in the [ERC-7730 toolkit](https://github.com/MiltonTulli/ERC-7730). Authoring commands (`generate`, `lint`, `preview`, `diff`) are [`@erc7730/cli`](https://www.npmjs.com/package/@erc7730/cli), a separate CLI-only package.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![ERC-7730](https://img.shields.io/badge/schema-v1%20%2B%20v2-3b82f6)](https://eips.ethereum.org/EIPS/eip-7730)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package is **not** a descriptor catalog. The source of truth is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Product direction: [ROADMAP.md](https://github.com/MiltonTulli/ERC-7730/blob/main/ROADMAP.md).

## Why ERC-7730?

Wallets still show raw calldata like `0xa9059cbb000000...`. [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) / [clearsigning.org](https://clearsigning.org) maps a call or typed-data payload to an intent and labeled fields.

**Before:**
```
Function: 0xa9059cbb
Param 1: 0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045
Param 2: 0x0000000000000000000000000000000000000000000000000000000005f5e100
```

**After:**
```
Send tokens
├── Amount: 100 USDC
└── Recipient: vitalik.eth
```

## Trust model

Clear signing depends on where the metadata came from. Keep these apart:

- **Official registry data** — `createOfficialRegistry({ pin })` reads [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry) at a commit SHA. `source` is `official-registry` (or `attested` once attestation verification exists).
- **Local overrides** — `extend()` / a custom registry. App-supplied descriptors, `source` `local-override`. Not a contribution path to the catalog.
- **Generated descriptors** — `generateDescriptor()` and the Sourcify fallback. ABI guesses, `source` `generated` or `sourcify`. Never `confidence: "high"`.
- **Inferred / basic decoding** — no descriptor matched. A 4-byte guess (`inferred`) or a raw selector (`basic`). `confidence` is `"low"`.
- **Trust policies** — `officialOnlyPolicy()`, `officialOrLocalPolicy()`, and `composePolicies()` set `trust.accepted`. They do not change the descriptor text. Production wallets should pass `officialOnlyPolicy()`.

Separate **trusted metadata** from **ABI guesses**. Sourcify and `generateDescriptor` are untrusted fallbacks — **never** `confidence: "high"`.

| `source` | `officialOnlyPolicy` | `officialOrLocalPolicy` | `confidence` if accepted |
| --- | --- | --- | --- |
| Official registry (commit SHA pin) or attestation | `accepted: true` | `accepted: true` | `"high"` |
| Local `extend()` override | **`false`** | `true` | `"medium"` |
| Sourcify / `generateDescriptor` | **`false`** | **`false`** | **never `"high"`** |
| Inferred / basic | **`false`** | **`false`** | `"low"` |

**Clear signing is not ABI pretty-printing.** Inject `officialOnlyPolicy()`, `officialOrLocalPolicy()`, or `composePolicies()`. Sourcify never returns `trust.accepted: true` under `officialOnlyPolicy`. When `trust` is omitted, decode uses a stub (`policy: "unspecified"`) with the same accept/reject rows as `officialOrLocalPolicy`.

`decodeTransaction`, `decodeTypedData`, and the deprecated `ClearSigner.decode` alias follow the table above. Sourcify is never `confidence: "high"`.

## Features

- **Schema v1 + v2** — `validateDescriptor()` against official JSON Schema
- **Official registry client** — pin `ethereum/clear-signing-erc7730-registry` by commit SHA
- **Resolve** — merge `includes` and inline field `$ref`
- **`decodeTransaction`** — apply official (or override) `display.formats` to calldata
- **Context matchers** — `matchContext()` for `deployments`, `factory.deployEvent`, and EIP-1967 / EIP-1167 proxies
- **`decodeTypedData`** — apply official EIP-712 descriptors (`index.eip712.json`)
- **`createClearSigner`** — bind `DecodeOptions` (`ClearSigner.decode` is a deprecated alias of `decodeTransaction`)
- **TrustPolicy** — `officialOnlyPolicy` / `officialOrLocalPolicy` / `composePolicies`
- **Untrusted fallback** — Sourcify / `generateDescriptor`, labeled by `source`
- **Warnings** — untrusted descriptors, infinite approvals, and similar risks
- **Tree-shakeable** — minimal dependencies

## Installation

```bash
npm install @erc7730/sdk
```

## Quick Start

```typescript
import {
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({
  pin: '9f37816afde954ff6617fb5baa346133e5af26c5',
});

const result = await decodeTransaction(
  {
    to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    data: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100',
    chainId: 1,
  },
  { registry, trust: officialOnlyPolicy(), useSourcifyFallback: false }
);

console.log(result.intent);
console.log(result.source);     // "official-registry" when the client matches
console.log(result.confidence); // "high" only when official-registry / attested is accepted
console.log(result.trust);      // { accepted, policy: "official-only", descriptorHash, reasons }
console.log(result.fields);
```

`ClearSigner.decode` is a deprecated alias of `decodeTransaction` (one minor). Prefer the functions, or `createClearSigner(options)` to bind registry / trust / provider.

Production lookups should use `createOfficialRegistry({ pin })`, not the v1 embedded snapshot.

Wallet drop-in (0.5): `decodeBatch`, `attestedPolicy`, `ExternalDataProvider`, `trustedTokens`, and `fetchPrebuiltRegistryIndex`. Coverage (0.6): Multicall3 / Safe `children[]`, `decodeUserOp`, `format` / `formatTypedData`, spender allowlist. Integrator walkthrough: [`docs/GUIDE.md`](../../docs/GUIDE.md). Interop: [`docs/interop.md`](../../docs/interop.md).

## viem adapters

```bash
npm install @erc7730/sdk viem
```

`@erc7730/sdk/viem` exposes `decodeViemTransaction` and `decodeViemTypedData`.
Both accept the same `DecodeOptions` and return the same `DecodedOperation` as
the core functions, including warnings and trust results. No signing is performed.

```ts
import { createOfficialRegistry, officialOnlyPolicy } from '@erc7730/sdk';
import { decodeViemTransaction, decodeViemTypedData } from '@erc7730/sdk/viem';
import { encodeFunctionData, erc20Abi, type TypedDataDefinition } from 'viem';

const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const recipient = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' as const;
const options = {
  registry: createOfficialRegistry({ pin: '9f37816afde954ff6617fb5baa346133e5af26c5' }),
  trust: officialOnlyPolicy(),
  useSourcifyFallback: false,
};

const transaction = await decodeViemTransaction({
  to: token,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipient, 100_000_000n],
  }),
  value: 0n,
  chainId: 1,
}, options);

const permit = {
  domain: { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: token },
  types: {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Permit',
  message: {
    owner: recipient,
    spender: '0x1111111254eeb25477b68fb85ed929f73a960582',
    value: 100_000_000n,
    nonce: 0n,
    deadline: 1_735_689_600n,
  },
} as const satisfies TypedDataDefinition;

const typedData = await decodeViemTypedData(permit, options);
console.log(transaction.intent, typedData.intent, typedData.warnings);
```

Transaction input requires `to`, `data`, and an explicit numeric `chainId`;
`value` (bigint) and `from` are optional. Add the chain ID when adapting a viem
transaction request; contract-creation transactions (`to: null`) are not supported.
RPC transaction responses use `input` instead of `data` and need that field mapped.
For requests with `account`, pass its address as `from` if sender context is needed.

Typed-data definitions may use readonly type arrays (`as const`) and omit `domain`.
The adapter copies those arrays for the core API and defaults an omitted domain to
`{}`. It does not infer a chain: without `domain.chainId`, the core cannot resolve
official metadata by chain. Bigint values are not serialized or coerced to numbers.

Domain-only definitions (`primaryType: 'EIP712Domain'`) may omit `types` and
`message`. The adapter decodes the domain itself as the signed fields, using an
explicit `types.EIP712Domain` when supplied or viem's canonical domain field
order and presence rules otherwise. These fields also appear in `raw.message`.

The viem peer remains optional in the package manifest, and the root entry point
does not re-export these adapters. Their viem imports are type-only. **This does
not make the existing SDK core viem-free:** core decoding/hashing already imports
viem at runtime, so install viem when using these decoding functions.

### wagmi (docs-only)

In an app that already uses wagmi, a small hook can bind the connected chain.
No React or wagmi dependency is shipped in this package:

```ts
import { useCallback } from 'react';
import { useChainId } from 'wagmi';
import type { DecodeOptions } from '@erc7730/sdk';
import { decodeViemTransaction, type ViemTransactionInput } from '@erc7730/sdk/viem';

export function useDecodeTransaction(options: DecodeOptions) {
  const chainId = useChainId();
  return useCallback(
    (tx: Omit<ViemTransactionInput, 'chainId'>) =>
      decodeViemTransaction({ ...tx, chainId }, options),
    [chainId, options],
  );
}
```

Pass explicit registry/trust options as above, and inspect the returned warnings
and `trust.accepted` before presenting the result as trusted clear signing.

## Official registry

The product catalog is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Pin a commit SHA in production — never `master`.

```typescript
import { createOfficialRegistry, decodeTypedData } from '@erc7730/sdk';

const registry = createOfficialRegistry({
  pin: '9f37816afde954ff6617fb5baa346133e5af26c5',
});

const weth = await registry.findCalldata({
  chainId: 1,
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
});

const usdcPermit = await registry.findEip712({
  chainId: 1,
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  signature: 'Permit',
});

const typedData = {
  chainId: 1,
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
  },
  types: {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Permit',
  message: {
    owner: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    spender: '0x1111111254eeb25477b68fb85ed929f73a960582',
    value: 100000000n,
    nonce: 0n,
    deadline: 1_735_689_600n,
  },
};

const decoded = await decodeTypedData(typedData, { registry });
```

`extend()` is for local overrides only. Submit new protocol metadata to the official registry, not this repository.

The v1 `ClearSigner` still ships a small built-in fallback (ERC-20 / ERC-721 / WETH) plus a legacy embed; that embed is not the live catalog.

Authoring CLI: [`@erc7730/cli`](https://www.npmjs.com/package/@erc7730/cli) (`erc7730 generate` / `lint` / `preview` / `diff` / `registry update`). `ERC7730_REGISTRY_PATH` points at a local clone; `registry update --pin <sha>` fills `~/.erc7730/registry/<pin>`.

Divergences vs Ledger `python-erc7730` resolved form (justified, golden-tested):

- Format keys stay ABI fragments (not 4-byte selectors).
- Constants are not inlined; nested field groups are not flattened; ABI HTTP URLs are not fetched.
- `fields` arrays merge by `path` as in EIP-7730 (python-erc7730 overwrites the array).

See [`docs/divergences.md`](../../docs/divergences.md) for the comparable slice, lint policy, and `pnpm golden:python`.

## Schema v2

```typescript
import { validateDescriptor, resolveDescriptor, createMemoryIncludeLoader } from '@erc7730/sdk';

const validated = validateDescriptor(input);
if (!validated.ok) {
  console.error(validated.errors);
}

const loader = createMemoryIncludeLoader({ 'common-Safe.json': commonSafe });
const resolved = await resolveDescriptor(input, loader);
// resolved.merged — includes merged, field $ref inlined, addresses lowercased
// resolved.hash   — keccak256 of canonical JSON (sorted keys, no extra whitespace)
```

Official descriptors often split shared formats into `common-*.json` and point fields at `$.display.definitions.*`. Inject an `IncludeLoader` for filesystem (CLI) or fetch (runtime).

## Untrusted fallback (Sourcify / generate)

Sourcify is **on by default** so unknown verified contracts still render something. That output is not curated metadata.

```typescript
const result = await decodeTransaction(
  {
    to: '0x6590cBBCCbE6B83eF3774Ef1904D86A7B02c2fCC',
    data: '0x2e17de78...',
    chainId: 1,
  },
  { useSourcifyFallback: true }
);

console.log(result.source);      // "sourcify" — untrusted
console.log(result.confidence);  // do not treat as "high"
```

Pass `useSourcifyFallback: false` to disable.

```typescript
import { createClearSigner, generateDescriptor, officialOrLocalPolicy } from '@erc7730/sdk';

const draft = generateDescriptor({
  chainId: 1,
  address: '0x...',
  abi: contractABI,
  owner: 'My Protocol'
});
// v2 draft with guessed formats — review intents; never confidence: "high"

const signer = createClearSigner({ trust: officialOrLocalPolicy(), useSourcifyFallback: false });
signer.extend([draft]);
```

## Security Warnings

```typescript
const result = await decodeTransaction({
  to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  data: '0x095ea7b3...ffffffffffffffffffffffffffffffffffffffff', // Infinite approval
  chainId: 1
});

console.log(result.warnings);
// [{
//   type: 'infinite_approval',
//   severity: 'high',
//   message: 'This approval grants unlimited spending access to your tokens'
// }]
```

## Local overrides

```typescript
import { createClearSigner, officialOrLocalPolicy } from '@erc7730/sdk';

const signer = createClearSigner({ trust: officialOrLocalPolicy() });

signer.extend([{
  context: {
    contract: {
      deployments: [{ chainId: 1, address: '0x...' }]
    }
  },
  metadata: {
    owner: 'My Protocol'
  },
  display: {
    formats: {
      'stake(uint256)': {
        intent: 'Stake tokens',
        fields: [
          { path: '[0]', label: 'Amount', format: 'tokenAmount' }
        ]
      }
    }
  }
}]);
```

## API Reference

### `createClearSigner` / `decodeTransaction` / `decodeTypedData`

```typescript
import {
  createClearSigner,
  decodeTransaction,
  decodeTypedData,
  officialOnlyPolicy,
} from '@erc7730/sdk';

export function createClearSigner(options?: DecodeOptions): ClearSigner;
export function decodeTransaction(tx: TransactionInput, options?: DecodeOptions): Promise<DecodedOperation>;
export function decodeTypedData(data: TypedDataInput, options?: DecodeOptions): Promise<DecodedOperation>;

const signer = createClearSigner({
  registry,
  trust: officialOnlyPolicy(),
  provider: null,
  useSourcifyFallback: false,
});

await signer.decodeTransaction(tx);
await signer.decodeTypedData(typedData);
// signer.decode(tx) — @deprecated alias of decodeTransaction (one minor)
```

Also exported: `matchContext`, `officialOnlyPolicy`, `officialOrLocalPolicy`, `composePolicies`, `createOfficialRegistry`, `validateDescriptor`, `resolveDescriptor`, `generateDescriptor`.

### Response Types

```typescript
interface DecodedOperation {
  confidence: 'high' | 'medium' | 'low';
  source:
    | 'official-registry'
    | 'attested'
    | 'local-override'
    | 'sourcify'
    | 'generated'
    | 'inferred'
    | 'basic';
  intent: string;
  functionName?: string;
  signature?: string;
  fields: DecodedField[];
  excluded: string[];
  warnings: SecurityWarning[];
  trust: {
    accepted: boolean;
    policy: string;
    descriptorHash?: string;
    reasons: string[];
  };
  metadata: {
    chainId: number;
    contractAddress?: string;
    descriptorId?: string;
  };
  raw: {
    selector?: string;
    args?: readonly unknown[];
    message?: Record<string, unknown>;
  };
}
```

## vs Ledger python-erc7730

| | `@erc7730/sdk` | Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) |
| --- | --- | --- |
| Language | TypeScript / JavaScript | Python |
| Role | **Runtime** for wallets and dApps (validate, resolve, decode) | **Authoring and firmware** tooling (lint, convert, device clear-signing) |
| Catalog | Consumes the official registry, pin by commit SHA | Same official catalog |
| Schema | v1 read + v2 validate | v1 / v2 |

## Supported Chains

Ethereum, Arbitrum, Optimism, Base, Polygon, BSC, Avalanche, and more.

## Web Demo

Try it online: [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/)

The demo shows `source`, `warnings`, and `trust.accepted` on every decode. Prefer `decodeTransaction` with `officialOnlyPolicy()` in production.

## Contributing

Protocol descriptors belong in [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).

SDK issues and features: [MiltonTulli/ERC-7730](https://github.com/MiltonTulli/ERC-7730).

## Schema compatibility

| Package line | ERC-7730 schema |
| --- | --- |
| SDK 0.x | Reads v1. `validateDescriptor` accepts v1 and v2 |

Schema versions follow the ERC-7730 standard. This package's `0.x` version does not name a schema version. `@erc7730/sdk` and `@erc7730/cli` publish on independent versions; GitHub tags are `sdk-vX.Y.Z` and `cli-vX.Y.Z`. See [RELEASE.md](https://github.com/MiltonTulli/ERC-7730/blob/main/RELEASE.md).

## License

MIT
