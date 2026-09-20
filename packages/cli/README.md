# @erc7730/cli

Command-line tools for ERC-7730 authors working in a JavaScript repo: generate a draft v2 descriptor from an ABI, lint files against the official schema, preview a decoded call, and diff against the pinned official registry.

This is **not** a catalog. Submit new protocol metadata to [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). The CLI will not open those PRs for you.

Generated drafts and Sourcify fallbacks are **never** `confidence: "high"`.

## Install

```bash
npm install -D @erc7730/cli
```

Requires Node 18+. Commands that talk to the official registry need a 40-character commit SHA pin (`--pin` or `ERC7730_REGISTRY_PIN`). The SDK's vendored pin is used when neither is set.

## Commands

```bash
erc7730 generate --chain-id 1 --address 0x... --abi ./abi.json --owner "My Protocol" [--url https://...]
erc7730 lint ./calldata-Foo.json
erc7730 preview --data 0x... --to 0x... --chain-id 1 [--pin <sha>]
erc7730 diff ./calldata-Foo.json --against official --pin <sha>
erc7730 registry update --pin <sha>
```

`lint` exits `1` when any issue has level `error` (schema failures, missing files, unresolved local includes). Warnings (empty formats, missing intent) do not fail the process.

`preview` prints intent + fields to stdout. Pass `--json` for the full `DecodedOperation`.

`registry update` downloads `index.calldata.json`, `index.eip712.json`, and referenced files into `~/.erc7730/registry/<pin>`. Point `ERC7730_REGISTRY_PATH` at a local clone (or that cache directory) to decode offline.

## Environment

| Variable | Meaning |
| --- | --- |
| `ERC7730_REGISTRY_PATH` | Local checkout of the official registry (paths as in the GitHub tree) |
| `ERC7730_REGISTRY_PIN` | Default commit SHA pin |
| `ERC7730_CACHE_DIR` | Cache root (default `~/.erc7730`) |

## Related

- [`@erc7730/sdk`](https://www.npmjs.com/package/@erc7730/sdk) — runtime (`validateDescriptor`, `decodeTransaction`, …)
- Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) — authoring/firmware linter the official registry CI runs
