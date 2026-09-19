# Divergences vs Ledger python-erc7730

Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) is the resolver/linter the official registry CI runs. This SDK is a TypeScript **runtime** (`validateDescriptor`, `resolveDescriptor`, `decodeTransaction` / `decodeTypedData`). Firmware conversion (`erc7730 convert` / `calldata`) is out of scope.

Golden tests project both resolved documents onto a comparable slice (deployments, format identity, intent, field path/label/format/visible) and fail on unexpected diffs. Everything below is **justified** and excluded from that slice.

Pinned CLI: `erc7730==1.0.11` (Python 3.12+).

## Resolved form

| Topic | `@erc7730/sdk` `resolveDescriptor` | python-erc7730 `erc7730 resolve` | Why |
| --- | --- | --- | --- |
| Format keys | Stay ABI fragments / EIP-712 `encodeType` strings | Calldata keys become 4-byte selectors | Selector matching is decode-time here; authors keep readable keys. Golden tests map ABI fragments with `parseDeclaration`. |
| Constants | `$.metadata.constants.*` left as paths | Inlined into field `params` (and as structured values) | Path engine reads constants at decode time. |
| `params.tokenPath` | Kept as a path string | Rewritten to a structured `token` path/constant object | Runtime formatters consume the ERC-7730 path string. |
| Nested field groups | Not flattened | Flattened where python considers it safe | Decode walks the input-shaped tree. |
| `fields` merge on `includes` | Merge by `path` (EIP-7730 overlay) | Replaces the whole `fields` array | Follow the EIP, not python's dict merge. Covered by `resolveDescriptor` unit tests, not the official-file goldens (those overlays do not redefine `fields`). |
| Enum `params.$ref` | Kept | v2 also keeps `$.metadata.enums.*` `$ref` on the sampled files | Not a current split. If python starts inlining enums, file it here rather than silently dropping the field. |
| ABI / schema HTTP URLs | Not fetched | v2 resolve ignores deprecated ABI/schema URL fields | Registry client is separate (`createOfficialRegistry`). |
| `display.definitions` | Left in `merged` after `$ref` inlining | Dropped (`null`) | Decode does not need the dictionary once fields are inlined. |
| Binding addresses | `address` / `verifyingContract` lowercased | Same | Compared. |

Vendor conversion (Ledger EIP-712 legacy, generic-parser calldata XML) is **not** compared.

## Lint

`validateDescriptor` is JSON Schema only. `erc7730 lint` adds semantic checks (display coverage vs on-chain ABI, EIP-712 keys, max length). Official files are expected to be **schema-valid here** and **error-free there**.

`erc7730 lint` warnings that compare the descriptor to Etherscan/Sourcify ABIs are **network-dependent** (missing display formats, proxy detection). They are not snapshotted. Golden lint records only **error** titles; those must stay empty for the sampled files. A fetch failure is skipped with a warning rather than treated as a resolver bug.

## How to run

```bash
# SDK resolve vs committed python snapshots (no Python)
pnpm --filter @erc7730/sdk test

# Re-run Ledger CLI and check / refresh snapshots (Python 3.12+)
pip install erc7730==1.0.11
pnpm golden:python
pnpm golden:python -- --update
```

CI job `Golden python-erc7730` runs `pnpm golden:python` on Python 3.12.

Cases live in `packages/sdk/test/golden/manifest.json` (11 official v2 descriptors: WETH, Aave v3, Lido stETH/wstETH, USDT, Uniswap V3 router, Swell, Ethena, Safe 1.4.1, USDC Permit, Permit2).
