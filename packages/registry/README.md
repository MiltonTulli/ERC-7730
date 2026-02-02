# @erc7730/registry

Community-driven registry of ERC-7730 descriptors for human-readable transaction decoding.

## Structure

```
descriptors/
├── erc20/
│   └── calldata-erc20.json       # ERC-20 token standard
├── erc721/
│   └── calldata-erc721.json      # ERC-721 NFT standard
├── weth/
│   └── calldata-weth.json        # Wrapped Ether
├── uniswap/
│   └── calldata-SwapRouter02.json
├── aave/
│   └── calldata-PoolV3.json
└── YOUR_PROTOCOL/
    └── calldata-YourContract.json
```

## Adding a New Protocol

### 1. Create Directory

```bash
mkdir -p descriptors/myprotocol
```

### 2. Create Descriptor File

Name it `calldata-ContractName.json`:

```json
{
  "$schema": "../../specs/erc7730-v1.schema.json",
  "context": {
    "$id": "MyProtocol",
    "contract": {
      "deployments": [
        { "chainId": 1, "address": "0x..." },
        { "chainId": 42161, "address": "0x..." }
      ]
    }
  },
  "metadata": {
    "owner": "Protocol Team",
    "info": {
      "legalName": "My Protocol",
      "url": "https://myprotocol.xyz"
    }
  },
  "display": {
    "formats": {
      "functionSignature(type1,type2)": {
        "$id": "functionName",
        "intent": "What this function does",
        "fields": [
          { "path": "param1", "label": "Label", "format": "tokenAmount" }
        ]
      }
    }
  }
}
```

### 3. Validate

```bash
pnpm validate
```

### 4. Submit PR

## Naming Conventions

- **Directory**: lowercase protocol name (`uniswap`, `aave`, `lido`)
- **File**: `calldata-ContractName.json` for contract calls
- **File**: `eip712-MessageName.json` for typed messages

## Field Formats

| Format | Use Case | Example |
|--------|----------|---------|
| `raw` | Numbers, booleans | Token ID, flags |
| `tokenAmount` | Token amounts | "100 USDC" |
| `addressName` | Addresses | "vitalik.eth" |
| `date` | Timestamps | "Jan 30, 2024" |
| `enum` | Mapped values | "stable" / "variable" |

## Compatible Registries

This registry follows the same JSON format as:
- [Ledger Clear Signing Registry](https://github.com/LedgerHQ/clear-signing-erc7730-registry)

Descriptors can be shared between registries.

## Building

```bash
pnpm build
```

This generates `dist/index.json` with an index of all descriptors.

## License

MIT
