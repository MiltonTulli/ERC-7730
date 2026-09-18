# ERC-7730 SDK

TypeScript runtime for [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear signing: validate descriptors, pin the official registry, resolve includes/`$ref`, and render human-readable calls.

See [ROADMAP.md](./ROADMAP.md) for v0.2–v0.5, the official-registry strategy, and the public API sketch.

See [RELEASE.md](./RELEASE.md) to version `@erc7730/sdk` with Changesets. Merging the Version PR publishes to npm after Environment `npm` approval.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![ERC-7730](https://img.shields.io/badge/schema-v1%20%2B%20v2-3b82f6)](https://eips.ethereum.org/EIPS/eip-7730)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This package is **not** a descriptor catalog. The source of truth is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). New protocol metadata belongs there, not in this repo.

## Why ERC-7730?

Wallets still show raw calldata like `0xa9059cbb000000...`. Users cannot verify what they sign.

ERC-7730 is the clear-signing standard ([clearsigning.org](https://clearsigning.org)): curated JSON that maps a contract call or typed-data payload to an intent and labeled fields.

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

Integrators must separate **trusted metadata** from **ABI guesses**. Shipping the latter as “clear signing” is false confidence.

| `source` | What it is | `trust.accepted` (documented default) | `confidence` |
| --- | --- | --- | --- |
| Official registry (commit SHA pin) or attestation | Curated ERC-7730 | `true` | `"high"` |
| Local `extend()` override | App-supplied | policy-defined | medium / high |
| Sourcify / `generateDescriptor` | ABI-generated fallback | **`false`** | **never `"high"`** |
| Inferred / basic selector decode | Guess from 4-byte + types | **`false`** | `"medium"` / `"low"` |

`TrustPolicy` (pluggable `trust.accepted`) is not wired yet — see [ROADMAP.md](./ROADMAP.md) and [#11](https://github.com/MiltonTulli/ERC-7730/issues/11). Until then, **`source` is the signal**. Do not treat Sourcify or generated descriptors as high-confidence.

The v1 `ClearSigner.decode` path still reports `confidence: "high"` for some Sourcify matches. That is a known gap, not the product rule.

## Features

- **Schema v1 + v2** — `validateDescriptor()` against official JSON Schema
- **Official registry client** — pin `ethereum/clear-signing-erc7730-registry` by commit SHA
- **Resolve** — merge `includes` and inline field `$ref` (`resolveDescriptor`)
- **Path engine** — `resolvePath()` for `#.` / `$.` / `@.` roots (structs, arrays, slices)
- **v1 calldata decode** — `ClearSigner.decode` (legacy; v2 decode is on the roadmap)
- **Untrusted fallback** — Sourcify / `generateDescriptor` are labeled by `source`, never trusted
- **Warnings** — infinite approvals and similar risks
- **Tree-shakeable** — no heavy default network catalog in the published tarball

## Installation

```bash
npm install @erc7730/sdk
```

## Quick Start

```typescript
import { ClearSigner } from '@erc7730/sdk';

const signer = new ClearSigner();

const result = await signer.decode({
  to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  data: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100',
  chainId: 1
});

console.log(result.intent);       // "Send tokens"
console.log(result.source);       // "registry" | "sourcify" | "inferred" | "basic"
console.log(result.confidence);   // treat "high" only for trusted registry metadata
console.log(result.fields[0]);    // { label: "Recipient", value: "vitalik.eth" }
console.log(result.warnings);
```

Production lookups should use `createOfficialRegistry({ pin })`, not the v1 embedded snapshot.

## Official registry

The canonical catalog is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Production lookups pin a **commit SHA** (never floating `master` / `main`).

```ts
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

// App-local overrides only — not a contribution path
registry.extend([myDescriptor]);
```

Indexes are CAIP-10 `eip155:{chainId}:{address}`. `index.calldata.json` maps to a descriptor path. `index.eip712.json` maps to primaryType + `encodeType` keccak; pass `signature` (primaryType) and/or `encodeTypeHash` when several files apply.

JSON is fetched on miss into an in-memory cache. Pass `cache` for optional fs / IndexedDB.

**New protocol descriptors:** open a PR on the [official registry](https://github.com/ethereum/clear-signing-erc7730-registry), not this repo. `packages/registry` is a historical snapshot used by the v1 `ClearSigner` embed and as test fixtures.

CLI later (#15): `ERC7730_REGISTRY_PATH` pointing at a local clone, and an `update` helper that fetches a pin (Cyfrin `clearsig update` model).

## Schema v2

`validateDescriptor(input)` compiles the official v1 and v2 JSON Schema. Version comes from `$schema` (`erc7730-v1` / `erc7730-v2`); if omitted, v2 is tried first, then v1.

```ts
import { validateDescriptor, resolveDescriptor } from '@erc7730/sdk';

const validated = validateDescriptor(input);
if (!validated.ok) {
  console.error(validated.errors); // { path, message, rule? }[]
}

const resolved = await resolveDescriptor(input, loader);
// resolved.merged — includes merged, field $ref inlined
// resolved.hash   — keccak256 of canonical JSON
```

## Path engine

ERC-7730 field paths are not plain ABI names. `resolvePath()` reads three roots against decoded data, the merged descriptor, and the transaction envelope:

| Root | Means | Example |
| --- | --- | --- |
| `#.` | Structured data (decoded args or EIP-712 message) | `#.amount`, `#.tupleField.child` |
| `$.` | Merged descriptor document | `$.metadata.enums.interestRateMode` |
| `@.` | Envelope | `@.to`, `@.value`, `@.chainId`, `@.from` |

Rootless paths (`amount`, `asset`) are relative to the structured data, or to `base` for nested `tokenPath` / `collectionPath`. Missing paths throw `PathResolveError` (`not_found` / `invalid` / `missing_data`) — they do not return `undefined`.

```ts
import { resolvePath } from '@erc7730/sdk';

resolvePath('#._amount', { args, descriptor, envelope });
resolvePath('@.value', { args, descriptor, envelope }); // Lido submit() native stake
resolvePath('token', { args, descriptor, envelope, base: '#.details.[0]' });
```

Token metadata fetching belongs to formatters ([#8](https://github.com/MiltonTulli/ERC-7730/issues/8)), not this function.

## Untrusted fallback

Sourcify and `generateDescriptor` exist so an unknown contract can still show *something*. They are **not** clear signing.

```ts
import { generateDescriptor } from '@erc7730/sdk';

const draft = generateDescriptor({
  chainId: 1,
  address: '0x...',
  abi: contractABI,
  owner: 'My Protocol',
});
// draft is a starting point for an upstream registry PR — never confidence: "high"
```

## Security Warnings

The SDK flags dangerous patterns on decoded fields:

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

`extend()` is for app-local descriptors only (tests, unpublished contracts). It is not how protocols join the catalog.

```typescript
const signer = new ClearSigner();

signer.registry.extend({
  context: {
    $id: 'MyProtocol',
    contract: {
      deployments: [{ chainId: 1, address: '0x...' }]
    }
  },
  metadata: {
    owner: 'My Company',
    info: { legalName: 'My Protocol', url: 'https://myprotocol.xyz' }
  },
  display: {
    formats: {
      'stake(uint256,uint256)': {
        $id: 'stake',
        intent: 'Stake tokens',
        fields: [
          { path: 'amount', label: 'Amount to stake', format: 'tokenAmount' },
          { path: 'lockPeriod', label: 'Lock period (days)', format: 'raw' }
        ],
        required: ['amount', 'lockPeriod']
      }
    }
  }
});
```

## Project Structure

```
erc7730-sdk/
├── packages/
│   ├── sdk/           # Core TypeScript SDK (npm package)
│   ├── registry/      # Legacy snapshot / test fixtures (not the product catalog)
│   └── web/           # Demo: always shows source + warnings
```

## Web Demo

Try it online: [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/)

Every decode shows `source`, `warnings`, and a `trust.accepted` placeholder (TrustPolicy comes later). Sourcify / generated output is labeled untrusted.

```bash
pnpm install
pnpm dev
```

## API Reference

### `ClearSigner`

```typescript
const signer = new ClearSigner(config?: ClearSignerConfig);
```

#### Config Options

```typescript
interface ClearSignerConfig {
  // Provider for ENS resolution and token metadata (optional)
  // If not provided, uses public RPCs by default
  // Pass `null` to disable network calls entirely
  provider?: Provider | null;
}
```

#### Methods

- `decode(tx: TransactionInput): Promise<DecodedTransaction>` - Decode a transaction
- `registry.extend(descriptor): void` - Add local overrides
- `registry.find(signature): RegistryMatch | null` - Find descriptor by signature

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
    protocol?: string;
    contractName?: string;
    chainId: number;
    contractAddress: string;
  };
}

interface DecodedField {
  label: string;
  value: string;
  rawValue: unknown;
  path: string;
  format: 'raw' | 'tokenAmount' | 'addressName' | 'date';
}

interface SecurityWarning {
  type: 'infinite_approval' | 'dangerous_permissions';
  severity: 'high' | 'medium' | 'low';
  message: string;
}
```

`ClearSigner.decode` may also set `source: 'sourcify'`. See the [trust model](#trust-model).

## vs Ledger python-erc7730

| | `@erc7730/sdk` | Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) |
| --- | --- | --- |
| Language | TypeScript / JavaScript | Python |
| Role | **Runtime** for wallets and dApps (validate, resolve, decode) | **Authoring and firmware** tooling (lint, convert, device clear-signing) |
| Catalog | Consumes the official registry, pin by commit SHA | Same official catalog |
| Schema | v1 read + v2 validate | v1 / v2 |

Divergences in the resolved form (until golden tests in #18): format keys stay ABI fragments (not 4-byte selectors); enum `params.$ref` is kept; `fields` merge by `path` as in EIP-7730 (python-erc7730 overwrites the array).

## Related

- [EIP-7730](https://eips.ethereum.org/EIPS/eip-7730)
- [clearsigning.org](https://clearsigning.org)
- [Official ERC-7730 registry](https://github.com/ethereum/clear-signing-erc7730-registry)
- [Ledger python-erc7730](https://github.com/LedgerHQ/python-erc7730)
- [Cyfrin clearsig](https://github.com/Cyfrin/clearsig)
- [ROADMAP.md](./ROADMAP.md)

## License

MIT © 2024
