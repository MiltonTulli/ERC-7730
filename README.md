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

| `source` | What it is | `officialOnlyPolicy` | `officialOrLocalPolicy` | `confidence` if accepted |
| --- | --- | --- | --- | --- |
| Official registry (commit SHA pin) or attestation | Curated ERC-7730 | `accepted: true` | `accepted: true` | `"high"` |
| Local `extend()` override | App-supplied | **`false`** | `true` | `"medium"` |
| Sourcify / `generateDescriptor` | ABI-generated fallback | **`false`** | **`false`** | **never `"high"`** |
| Inferred / basic selector decode | Guess from 4-byte + types | **`false`** | **`false`** | **`"low"`** |

**Clear signing is not ABI pretty-printing.** A JSON descriptor that labels fields is not automatically trustworthy — the official registry disclaimer is inclusion ≠ audit. Inject a `TrustPolicy` (`officialOnlyPolicy()`, `officialOrLocalPolicy()`, or `composePolicies()`) so the wallet decides who to believe. Sourcify / generated / inferred / basic never return `trust.accepted: true` under `officialOnlyPolicy`.

When `trust` is omitted, decode uses a stub (`policy: "unspecified"`) that follows the same accept/reject rows as `officialOrLocalPolicy`. Production should pass `officialOnlyPolicy()`.

`decodeTransaction`, `decodeTypedData`, and the deprecated `ClearSigner.decode` alias all use the table above: inferred and basic are `"low"`.

## Features

- **Schema v1 + v2** — `validateDescriptor()` against official JSON Schema
- **Official registry client** — pin `ethereum/clear-signing-erc7730-registry` by commit SHA
- **Resolve** — merge `includes` and inline field `$ref` (`resolveDescriptor`)
- **Path engine** — `resolvePath()` for `#.` / `$.` / `@.` roots (structs, arrays, slices)
- **`decodeTransaction`** — apply official (or override) `display.formats` to calldata (`#` / `$` / `@` paths)
- **Context matchers** — `matchContext()` binds descriptors with `deployments`, `factory.deployEvent`, and EIP-1967 / EIP-1167 proxies; a familiar selector on an unbound address is not `confidence: "high"`
- **`decodeTypedData`** — apply official EIP-712 descriptors (`index.eip712.json`, Permit + `encodeType` hash)
- **`createClearSigner`** — bind `DecodeOptions` for repeated `decodeTransaction` / `decodeTypedData` (`ClearSigner.decode` is a deprecated alias)
- **TrustPolicy** — `officialOnlyPolicy` / `officialOrLocalPolicy` / `composePolicies`; Sourcify is never accepted
- **Untrusted fallback** — Sourcify / `generateDescriptor` are labeled by `source`, never trusted
- **Warnings** — untrusted descriptors, infinite approvals, expired typed-data deadlines
- **Tree-shakeable** — no heavy default network catalog in the published tarball

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
    to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    data: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100',
    chainId: 1,
  },
  { registry, trust: officialOnlyPolicy(), useSourcifyFallback: false }
);

console.log(result.intent);       // "Send" + formatted fields when a descriptor matches
console.log(result.source);       // e.g. "official-registry" | "local-override" | "sourcify" | "inferred" | "basic"
console.log(result.confidence);   // "high" only when official-registry / attested is accepted
console.log(result.trust);        // { accepted, policy: "official-only", descriptorHash, reasons }
console.log(result.fields);       // [{ label: "Amount", value: "100 USDC", format: "tokenAmount" }, ...]
console.log(result.warnings);     // e.g. untrusted_descriptor, infinite_approval, untrusted_spender
```

`ClearSigner.decode` is a deprecated alias of `decodeTransaction` (one minor). Prefer the functions, or `createClearSigner(options)` to bind registry / trust / provider.

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

`extend()` is for app-local descriptors only (tests, unpublished contracts). It is not how protocols join the catalog.

```typescript
import { createClearSigner, officialOrLocalPolicy } from '@erc7730/sdk';

const signer = createClearSigner({
  registry,
  trust: officialOrLocalPolicy(),
  useSourcifyFallback: false,
});

signer.extend({
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    $id: 'MyProtocol',
    contract: {
      deployments: [{ chainId: 1, address: '0x...' }]
    }
  },
  metadata: {
    owner: 'My Company',
    info: { legalName: 'My Protocol', url: 'https://myprotocol.xyz', deploymentDate: '2024-01-01T00:00:00Z' }
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

Every decode shows `source`, `warnings`, and `trust.accepted`. The demo calls `createClearSigner` + `decodeTransaction` with `createOfficialRegistry({ pin })` and `officialOrLocalPolicy()`. Production should pass `officialOnlyPolicy()`. Sourcify / generated output is labeled untrusted.

```bash
pnpm install
pnpm dev
```

## API Reference

### `decodeTransaction` / `decodeTypedData` / `createClearSigner`

Primary 0.3 surface — functions plus an optional factory that binds `DecodeOptions`:

```typescript
import {
  createClearSigner,
  createOfficialRegistry,
  decodeTransaction,
  decodeTypedData,
  officialOnlyPolicy,
} from '@erc7730/sdk';

export function createClearSigner(options?: DecodeOptions): ClearSigner;
export function decodeTransaction(tx: TransactionInput, options?: DecodeOptions): Promise<DecodedOperation>;
export function decodeTypedData(data: TypedDataInput, options?: DecodeOptions): Promise<DecodedOperation>;
```

```typescript
interface ClearSigner {
  decodeTransaction(tx: TransactionInput): Promise<DecodedOperation>;
  decodeTypedData(data: TypedDataInput): Promise<DecodedOperation>;
  extend(descriptors: InputDescriptor | readonly InputDescriptor[]): void;
  /** @deprecated Use decodeTransaction. Alias for one minor (0.3.x). */
  decode(tx: TransactionInput): Promise<DecodedOperation>;
}

interface DecodeOptions {
  provider?: Provider | null;
  registry?: DecodeRegistry | OfficialRegistry;
  trust?: TrustPolicy;            // default stub policy: "unspecified"
  useSourcifyFallback?: boolean;  // default true; never confidence "high"
  locale?: string;                // BCP-47, default "en"
  now?: number | (() => number);  // unix seconds for expired_deadline
  fromBlock?: bigint | LogBlockTag;
  toBlock?: bigint | LogBlockTag;
}
```

```typescript
const signer = createClearSigner({
  registry,
  trust: officialOnlyPolicy(),
  provider: null,
  useSourcifyFallback: false,
});
await signer.decodeTransaction(tx);
await signer.decodeTypedData(typedData);
```

Also exported: `matchContext`, `officialOnlyPolicy`, `officialOrLocalPolicy`, `composePolicies`, `resolvePath`, `createOfficialRegistry`, `validateDescriptor`, `resolveDescriptor`, `generateDescriptor`.

### `decodeTransaction`

```typescript
const result = await decodeTransaction(tx, {
  registry,                 // OfficialRegistry (or any { findCalldata })
  trust: officialOnlyPolicy(), // or officialOrLocalPolicy() / composePolicies(...)
  provider: null,           // no RPC; pass a viem PublicClient for ENS / token metadata / factory logs
  useSourcifyFallback: true // default; never confidence "high" / never trust.accepted
});
```

Format keys match by 4-byte selector, canonical signature, or Solidity declaration. Paths use `#` (decoded args), `$` (merged descriptor), `@` (envelope: `to` / `value` / `chainId` / `from`).

`context` is checked before a descriptor is applied (`matchContext`). v2 matchers:

- `contract.deployments` / `eip712.deployments` — exact `chainId` + address
- EIP-1967 implementation slot and EIP-1167 bytecode — `tx.to` (or `verifyingContract`) is a proxy whose implementation is in `deployments`
- `contract.factory` — `getLogs` for `deployEvent`; the target address must appear as an **address argument of that event ABI**, and the emitter must be a listed factory. Event layouts are not hardcoded. `getLogs` defaults to `fromBlock: "earliest"` / `toBlock: "latest"` (omitted bounds would only search the latest block); pass a bounded range on public RPCs.
- `eip712.domain` / `eip712.domainSeparator` — typed-data domain constraints

Official `index.calldata.json` is CAIP-10 of listed deployments (and EIP-1967 / EIP-1167 implementations). There is no factory-clone catalog; factory-only files match via `extend()` + `matchContext`.

`addressMatcher` URLs are not fetched (v1 draft; not in the v2 schema). If context does not match, the descriptor is not applied even when the selector is a known `transfer`.

Formats in this release: `raw`, `amount`, `tokenAmount`, `date`, `duration`, `addressName` (alias `addressOrName`), `enum`, `nftName`.

### `TrustPolicy`

```typescript
import {
  composePolicies,
  officialOnlyPolicy,
  officialOrLocalPolicy,
} from '@erc7730/sdk';

const trust = officialOnlyPolicy();
// or officialOrLocalPolicy()
// or composePolicies([officialOnlyPolicy(), myPolicy], 'all' | 'any')

await decodeTransaction(tx, { registry, trust });
```

`trust.reasons` is always set. `trust.descriptorHash` is set whenever a descriptor was used. ERC-8176 attestation verification is not implemented here (see [#18](https://github.com/MiltonTulli/ERC-7730/issues/18)).

### `decodeTypedData`

```typescript
import { createOfficialRegistry, decodeTypedData } from '@erc7730/sdk';

const registry = createOfficialRegistry({
  pin: '9f37816afde954ff6617fb5baa346133e5af26c5',
});

const owner = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const spender = '0x1111111254eeb25477b68fb85ed929f73a960582';
const value = 100000000n;
const nonce = 0n;
const deadline = 1_735_689_600n;

const result = await decodeTypedData(
  {
    chainId: 1,
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: 1,
      verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
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
    message: { owner, spender, value, nonce, deadline },
  },
  { registry, now: 1_735_689_600 } // unix seconds; inject in tests for expired_deadline
);
```

Lookup is CAIP-10 `eip155:{chainId}:{verifyingContract}`. When several files share `primaryType`, keccak256 of EIP-712 `encodeType` picks the descriptor. `@.to` is the verifying contract. `raw.message` is the normalized payload.

Default confidence (`officialOnlyPolicy` / documented stub):

| source | `trust.accepted` | confidence |
| --- | --- | --- |
| official-registry / attested | `true` | `high` |
| local-override | `false` under official-only; `true` under official-or-local | `medium` if accepted |
| sourcify / generated / inferred / basic | `false` | `low` |

### Response Types

```typescript
/** Result of `decodeTransaction` / `decodeTypedData`. */
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
  selector?: string;
  fields: DecodedField[];
  excluded: string[];
  warnings: SecurityWarning[];
  trust: {
    accepted: boolean;
    policy: string;
    descriptorHash?: string;
    attesters?: string[];
    reasons: string[];
  };
  metadata: {
    owner?: string;
    contractName?: string;
    protocolUrl?: string;
    chainId: number;
    contractAddress?: string;
    descriptorId?: string;
    registryPath?: string;
  };
  raw: {
    selector?: string;
    args?: readonly unknown[];
    /** Set by `decodeTypedData`; `decodeTransaction` does not set this. */
    message?: Record<string, unknown>;
  };
}

/** @deprecated Pre-0.3 shape. `ClearSigner.decode` now returns `DecodedOperation`. */
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
  raw: {
    selector: string;
    args: readonly unknown[];
  };
}

interface DecodedField {
  label: string;
  value: string;
  rawValue: unknown;
  path: string;
  format: 'raw' | 'amount' | 'tokenAmount' | 'date' | 'duration' | 'addressName' | 'enum' | 'nftName';
}

interface SecurityWarning {
  type:
    | 'infinite_approval'
    | 'dangerous_permissions'
    | 'untrusted_descriptor'
    | 'untrusted_spender'
    | 'ownership_change'
    | 'proxy_upgrade'
    | 'expired_deadline'
    | 'selector_mismatch'
    | 'missing_metadata';
  severity: 'high' | 'medium' | 'low';
  message: string;
  path?: string;
}
```

`decodeTransaction` / `decodeTypedData` emit these checks when they apply. `missing_metadata` also covers unknown token decimals. `selector_mismatch` is best-effort against a Sourcify ABI.

`metadata.descriptorId` is the descriptor `context.$id` when a format matches. `raw.message` is the normalized EIP-712 payload from `decodeTypedData`; `decodeTransaction` does not set it. Descriptor input may use `addressOrName`; the field `format` on the result is `addressName`.

`ClearSigner.decode` is a deprecated alias of `decodeTransaction` and returns `DecodedOperation` (not the old `DecodedTransaction` shape). See the [trust model](#trust-model).

## vs Ledger python-erc7730

| | `@erc7730/sdk` | Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) |
| --- | --- | --- |
| Language | TypeScript / JavaScript | Python |
| Role | **Runtime** for wallets and dApps (validate, resolve, decode) | **Authoring and firmware** tooling (lint, convert, device clear-signing) |
| Catalog | Consumes the official registry, pin by commit SHA | Same official catalog |
| Schema | v1 read + v2 validate | v1 / v2 |

Known diffs in the resolved form are listed in [`docs/divergences.md`](./docs/divergences.md) (justified only). Golden tests project `resolveDescriptor` against `erc7730 resolve` on 11 official v2 descriptors and require `erc7730 lint` to report no errors on those files.

```bash
# SDK vs committed python snapshots (no Python)
pnpm --filter @erc7730/sdk test

# Re-run Ledger CLI (Python 3.12+): pip install erc7730==1.0.11
pnpm golden:python
pnpm golden:python -- --update
```

CI job **Golden python-erc7730** runs `pnpm golden:python`.

## Related

- [EIP-7730](https://eips.ethereum.org/EIPS/eip-7730)
- [clearsigning.org](https://clearsigning.org)
- [Official ERC-7730 registry](https://github.com/ethereum/clear-signing-erc7730-registry)
- [Ledger python-erc7730](https://github.com/LedgerHQ/python-erc7730)
- [Cyfrin clearsig](https://github.com/Cyfrin/clearsig)
- [ROADMAP.md](./ROADMAP.md)

## License

MIT © 2024
