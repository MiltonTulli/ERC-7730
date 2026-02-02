# ERC-7730 SDK

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
- 🌐 **Community registry** - contribute descriptors for any protocol
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
│   ├── registry/      # Community-driven descriptor registry
│   └── web/           # Demo web application
```

## Contributing Descriptors

Want to add support for a protocol? We welcome contributions!

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/erc7730-sdk.git
cd erc7730-sdk
pnpm install
```

### 2. Create a Descriptor

Create a new file in `packages/registry/descriptors/YOUR_PROTOCOL/`:

```bash
mkdir -p packages/registry/descriptors/myprotocol
touch packages/registry/descriptors/myprotocol/calldata-MyContract.json
```

### 3. Write Your Descriptor

Follow the [ERC-7730 specification](https://eips.ethereum.org/EIPS/eip-7730):

```json
{
  "$schema": "../../specs/erc7730-v1.schema.json",
  "context": {
    "$id": "MyProtocol",
    "contract": {
      "deployments": [
        { "chainId": 1, "address": "0x..." },
        { "chainId": 137, "address": "0x..." }
      ]
    }
  },
  "metadata": {
    "owner": "My Protocol Team",
    "info": {
      "legalName": "My Protocol",
      "url": "https://myprotocol.xyz",
      "deploymentDate": "2024-01-01T00:00:00Z"
    }
  },
  "display": {
    "formats": {
      "functionName(type1,type2)": {
        "$id": "functionName",
        "intent": "Human-readable description of what this does",
        "fields": [
          {
            "path": "paramName",
            "format": "tokenAmount",
            "label": "User-friendly label",
            "params": { "tokenPath": "@.to" }
          }
        ],
        "required": ["paramName"]
      }
    }
  }
}
```

### 4. Field Formats

| Format | Description | Params |
|--------|-------------|--------|
| `raw` | Display value as-is | - |
| `tokenAmount` | Format as token amount with decimals | `tokenPath`: path to token address |
| `addressName` | Resolve to ENS or display shortened | `types`, `sources` |
| `date` | Unix timestamp to date | - |
| `enum` | Map value to label | `$ref` to enum definition |

### 5. Test Your Descriptor

```bash
# Validate JSON
pnpm --filter @erc7730/registry validate

# Run the demo app
pnpm dev

# Test with your calldata
```

### 6. Submit a PR

```bash
git checkout -b add-myprotocol-descriptor
git add packages/registry/descriptors/myprotocol/
git commit -m "feat: add MyProtocol descriptor"
git push origin add-myprotocol-descriptor
```

Then open a Pull Request!

## Descriptor Guidelines

1. **Use the official schema**: Always include `"$schema": "../../specs/erc7730-v1.schema.json"`
2. **Include all deployments**: List the contract address for every chain it's deployed on
3. **Write clear intents**: Use action verbs like "Swap tokens", "Stake ETH", "Approve spending"
4. **Label fields clearly**: Use terminology users will understand
5. **Mark required fields**: Help users know what's essential

## Web Demo

Try it online: [erc7730-sdk.github.io](https://erc7730-sdk.github.io)

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
- [Ledger Clear Signing Registry](https://github.com/LedgerHQ/clear-signing-erc7730-registry) - Official Ledger registry (Python)
- [python-erc7730](https://github.com/LedgerHQ/python-erc7730) - Python SDK by Ledger

## Differences from Ledger's Implementation

| Feature | This SDK | Ledger python-erc7730 |
|---------|----------|----------------------|
| Language | TypeScript | Python |
| Use case | dApps, frontends | Wallet firmware |
| Registry | Community JSON files | Ledger-curated |
| Runtime | Browser & Node.js | Python 3.12+ |

## License

MIT © 2024
