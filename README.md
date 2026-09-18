# ERC-7730 SDK

See [ROADMAP.md](./ROADMAP.md) for v0.2–v0.5, official registry strategy, and the public API sketch.

See [RELEASE.md](./RELEASE.md) to version `@erc7730/sdk` with Changesets and cut an npm release from a `vX.Y.Z` tag.

> TypeScript SDK for decoding blockchain transactions into human-readable format using the [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) standard.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why ERC-7730?

When you sign a transaction, your wallet shows you raw calldata like `0xa9059cbb000000...`. This is unreadable and dangerous—users can't verify what they're actually signing.

ERC-7730 is a standard that provides **human-readable descriptions** for smart contract calls. This SDK implements the standard for TypeScript/JavaScript applications.

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

## Features

- 🔍 **Decode any calldata** into human-readable format
- 📦 **Zero config** - works out of the box with common standards (ERC-20, ERC-721, etc.)
- 🔌 **Extensible** - add your own contract descriptors
- 🌐 **Official registry client** - pin `ethereum/clear-signing-erc7730-registry` by commit SHA
- 🔒 **Security warnings** - detects infinite approvals and other risks
- ⚡ **Lightweight** - tree-shakeable, no heavy dependencies

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
console.log(result.fields[0]);    // { label: "Recipient", value: "vitalik.eth" }
console.log(result.fields[1]);    // { label: "Amount", value: "100 USDC" }
console.log(result.confidence);   // "high"
```

## Security Warnings

The SDK automatically detects dangerous patterns:

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

## Extending with Custom Descriptors

Add support for your own contracts:

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
│   └── web/           # Demo web application
```

## Official registry

The canonical catalog is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Production lookups pin a **commit SHA** (never floating `master`).

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

// App-local overrides only
registry.extend([myDescriptor]);
```

Indexes are CAIP-10 `eip155:{chainId}:{address}`. `index.calldata.json` maps to a descriptor path. `index.eip712.json` maps to primaryType + `encodeType` keccak; pass `signature` (primaryType) and/or `encodeTypeHash` when several files apply.

JSON is fetched on miss into an in-memory cache. Pass `cache` for optional fs / IndexedDB.

**New protocol descriptors:** open a PR on the [official registry](https://github.com/ethereum/clear-signing-erc7730-registry), not this repo. `packages/registry` is a historical snapshot used by the v1 `ClearSigner` embed and as test fixtures.

CLI later (#15): `ERC7730_REGISTRY_PATH` pointing at a local clone, and an `update` helper that fetches a pin (Cyfrin `clearsig update` model).

## Web Demo

Try it online: [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/)

Or run locally:

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
- `registry.extend(descriptor): void` - Add custom descriptors
- `registry.find(signature): RegistryMatch | null` - Find descriptor by signature

### Response Types

```typescript
interface DecodedTransaction {
  confidence: 'high' | 'medium' | 'low';
  source: 'registry' | 'inferred' | 'basic';
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

## Related Projects

- [ERC-7730 Specification](https://eips.ethereum.org/EIPS/eip-7730)
- [Official ERC-7730 registry](https://github.com/ethereum/clear-signing-erc7730-registry)
- [python-erc7730](https://github.com/LedgerHQ/python-erc7730) - Python SDK by Ledger
- [Cyfrin clearsig](https://github.com/Cyfrin/clearsig)

## Differences from Ledger's Implementation

| Feature | This SDK | Ledger python-erc7730 |
|---------|----------|----------------------|
| Language | TypeScript | Python |
| Use case | dApps, frontends | Wallet firmware |
| Registry | Official GitHub registry, pin by SHA | Same catalog (Python tooling) |
| Runtime | Browser & Node.js | Python 3.12+ |

## License

MIT © 2024
