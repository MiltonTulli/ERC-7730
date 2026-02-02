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
- 📦 **Zero config** - works out of the box with 354 descriptors from 44 protocols
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

## Contributing

We welcome contributions! See the [main repository](https://github.com/MiltonTulli/ERC-7730) for:

- Contributing new descriptors
- Reporting issues
- Feature requests

## License

MIT
