# @erc7730/registry

> **Not the product catalog.** The canonical source is
> [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).
> Submit new protocol descriptors there. This package is a historical snapshot
> used as test fixtures and by the v1 `ClearSigner` embed.

Do not open descriptor PRs against this repository. For app-local overrides, use `createOfficialRegistry({ pin }).extend()` in `@erc7730/sdk`.

## Fixture layout

```
descriptors/
├── erc20/
│   └── calldata-erc20.json
├── erc721/
│   └── calldata-erc721.json
├── weth/
│   └── calldata-weth.json
└── …
```

Naming (fixtures only):

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

## Building

```bash
pnpm build
```

This generates `dist/index.json` with an index of all descriptors. That index is a snapshot, not the live CAIP-10 maps (`index.calldata.json` / `index.eip712.json`) wallets should pin.

## License

MIT
