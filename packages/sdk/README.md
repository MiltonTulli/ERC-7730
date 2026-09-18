# @erc7730/sdk

> TypeScript SDK for decoding blockchain transactions into human-readable format using the [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) standard.

[![npm version](https://img.shields.io/npm/v/@erc7730/sdk.svg)](https://www.npmjs.com/package/@erc7730/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why ERC-7730?

When you sign a transaction, your wallet shows you raw calldata like `0xa9059cbb000000...`. This is unreadable and dangerous—users can't verify what they're actually signing.

ERC-7730 provides **human-readable descriptions** for smart contract calls.

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
- 📦 **Official registry client** - pin `ethereum/clear-signing-erc7730-registry` by commit SHA
- 🌐 **Sourcify integration** - auto-fetch ABIs for verified contracts
- 🔌 **Extensible** - add your own contract descriptors
- 🔒 **Security warnings** - detects infinite approvals and other risks
- ⚡ **Lightweight** - tree-shakeable, minimal dependencies

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

## Sourcify Fallback

The SDK automatically fetches ABIs from [Sourcify](https://sourcify.dev) for verified contracts not in the registry:

```typescript
const signer = new ClearSigner(); // Sourcify enabled by default

// Even if this contract isn't in the registry, if it's verified on Sourcify,
// the SDK will fetch the ABI and generate a descriptor automatically
const result = await signer.decode({
  to: '0x6590cBBCCbE6B83eF3774Ef1904D86A7B02c2fCC',
  data: '0x2e17de78...',
  chainId: 1
});

console.log(result.source); // "sourcify"
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

## Generate Descriptors from ABI

```typescript
import { generateDescriptor } from '@erc7730/sdk';

const descriptor = generateDescriptor({
  chainId: 1,
  address: '0x...',
  abi: contractABI,
  owner: 'My Protocol'
});

// Use it with ClearSigner
const signer = new ClearSigner();
signer.extend([descriptor]);
```

## Custom Descriptors

Add support for your own contracts:

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

## Resolve includes and `$ref`

Official descriptors often split shared formats into `common-*.json` and point fields at `$.display.definitions.*`. `resolveDescriptor()` merges those files and inlines field `$ref`s. Inject an `IncludeLoader` for filesystem (CLI) or fetch (runtime).

```typescript
import { resolveDescriptor, createMemoryIncludeLoader } from '@erc7730/sdk';

const loader = createMemoryIncludeLoader({ 'common-Safe.json': commonSafe });
const resolved = await resolveDescriptor(input, loader);
// resolved.merged — includes merged, field $ref inlined, addresses lowercased
// resolved.hash   — keccak256 of canonical JSON (sorted keys, no extra whitespace)
```

`descriptorHash()` is deterministic in Node and browsers: UTF-8 JSON, sorted keys, checksum addresses lowercased.

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

  // Enable/disable Sourcify fallback (default: true)
  useSourcifyFallback?: boolean;

  // Custom descriptors
  registry?: {
    custom?: ERC7730Descriptor[];
  };
}
```

#### Methods

- `decode(tx): Promise<DecodedTransaction>` - Decode a transaction
- `extend(descriptors): void` - Add custom descriptors

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

## Supported Chains

Ethereum, Arbitrum, Optimism, Base, Polygon, BSC, Avalanche, and more.

## Web Demo

Try it online: [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/)

## Contributing

Protocol descriptors belong in [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).

SDK issues and features: [MiltonTulli/ERC-7730](https://github.com/MiltonTulli/ERC-7730).

## License

MIT
