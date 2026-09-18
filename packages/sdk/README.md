# @erc7730/sdk

TypeScript runtime for [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear signing.

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

Separate **trusted metadata** from **ABI guesses**. Sourcify and `generateDescriptor` are untrusted fallbacks — **never** `confidence: "high"`.

| `source` | `trust.accepted` (documented default) | `confidence` |
| --- | --- | --- |
| Official registry (commit SHA pin) or attestation | `true` | `"high"` |
| Local `extend()` override | policy-defined | medium / high |
| Sourcify / `generateDescriptor` | **`false`** | **never `"high"`** |
| Inferred / basic | **`false`** | `"medium"` / `"low"` |

`TrustPolicy` is not wired yet. Until then, **`source` is the signal**. The v1 `ClearSigner.decode` path may still report `confidence: "high"` for some Sourcify matches — that is a known gap, not the product rule.

## Features

- **Schema v1 + v2** — `validateDescriptor()` against official JSON Schema
- **Official registry client** — pin `ethereum/clear-signing-erc7730-registry` by commit SHA
- **Resolve** — merge `includes` and inline field `$ref`
- **`decodeTransaction`** — apply official (or override) `display.formats` to calldata
- **v1 calldata decode** — `ClearSigner.decode` (legacy)
- **Untrusted fallback** — Sourcify / `generateDescriptor`, labeled by `source`
- **Warnings** — infinite approvals and similar risks
- **Tree-shakeable** — minimal dependencies

## Installation

```bash
npm install @erc7730/sdk
```

## Quick Start

```typescript
import { createOfficialRegistry, decodeTransaction } from '@erc7730/sdk';

const registry = createOfficialRegistry({
  pin: '9f37816afde954ff6617fb5baa346133e5af26c5',
});

const result = await decodeTransaction(
  {
    to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    data: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100',
    chainId: 1,
  },
  { registry, useSourcifyFallback: false }
);

console.log(result.intent);
console.log(result.source);     // "official-registry" when the client matches
console.log(result.confidence); // "high" only for official-registry / attested
console.log(result.trust);      // stub { policy: "unspecified", accepted } until #11
console.log(result.fields);
```

`ClearSigner.decode` remains the v1 pretty-printer. Prefer `decodeTransaction` for descriptor-backed clear signing.

Production lookups should use `createOfficialRegistry({ pin })`, not the v1 embedded snapshot.

## Official registry

The product catalog is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Pin a commit SHA in production — never `master`.

```typescript
import { createOfficialRegistry } from '@erc7730/sdk';

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
```

`extend()` is for local overrides only. Submit new protocol metadata to the official registry, not this repository.

The v1 `ClearSigner` still ships a small built-in fallback (ERC-20 / ERC-721 / WETH) plus a legacy embed; that embed is not the live catalog.

CLI later (#15): `ERC7730_REGISTRY_PATH` for a local clone, and an `update` helper in the Cyfrin `clearsig update` style.

Divergences vs Ledger `python-erc7730` resolved form:

- Format keys stay ABI fragments (not 4-byte selectors).
- Constants and enum `params.$ref` are not inlined.
- Nested field groups are not flattened; ABI HTTP URLs are not fetched.
- `fields` arrays merge by `path` as in EIP-7730 (python-erc7730 overwrites the array).

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

Sourcify is **on by default** for `ClearSigner.decode` so unknown verified contracts still render something. That output is not curated metadata.

```typescript
const signer = new ClearSigner(); // Sourcify enabled by default

const result = await signer.decode({
  to: '0x6590cBBCCbE6B83eF3774Ef1904D86A7B02c2fCC',
  data: '0x2e17de78...',
  chainId: 1
});

console.log(result.source);      // "sourcify" — untrusted
console.log(result.confidence);  // do not treat as "high"
```

Pass `useSourcifyFallback: false` to disable.

```typescript
import { generateDescriptor } from '@erc7730/sdk';

const draft = generateDescriptor({
  chainId: 1,
  address: '0x...',
  abi: contractABI,
  owner: 'My Protocol'
});
// Starting point for an upstream registry PR — never confidence: "high"

const signer = new ClearSigner();
signer.extend([draft]);
```

## Security Warnings

```typescript
const result = await signer.decode({
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
const signer = new ClearSigner();

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

### `ClearSigner`

```typescript
const signer = new ClearSigner(config?: ClearSignerConfig);
```

#### Config Options

```typescript
interface ClearSignerConfig {
  // Custom RPC URL (uses public RPCs by default)
  rpcUrl?: string;

  // Provider for ENS resolution and token metadata
  provider?: Provider | null;

  // Enable/disable Sourcify fallback (default: true). Untrusted when used.
  useSourcifyFallback?: boolean;

  // Local overrides
  registry?: {
    custom?: ERC7730Descriptor[];
  };
}
```

#### Methods

- `decode(tx): Promise<DecodedTransaction>` - Decode a transaction
- `extend(descriptors): void` - Add local overrides

Also exported: `createOfficialRegistry`, `validateDescriptor`, `resolveDescriptor`, `generateDescriptor`.

### Response Types

```typescript
interface DecodedTransaction {
  confidence: 'high' | 'medium' | 'low';
  source: 'registry' | 'sourcify' | 'inferred' | 'basic';
  intent: string;
  functionName: string;
  signature: string;
  fields: DecodedField[];
  warnings: SecurityWarning[];
  metadata: {
    chainId: number;
    contractAddress: string;
  };
  raw: {
    selector: string;
    args: readonly unknown[];
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

The demo shows `source`, `warnings`, and a `trust.accepted` placeholder on every decode.

## Contributing

Protocol descriptors belong in [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).

SDK issues and features: [MiltonTulli/ERC-7730](https://github.com/MiltonTulli/ERC-7730).

## License

MIT
