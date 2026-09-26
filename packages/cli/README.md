# @erc7730/cli

Command-line tools for ERC-7730 authors working in a JavaScript repo: generate a draft v2 descriptor from an ABI, lint descriptors and registry testsv2 files, preview a decoded call (intent + trust), scaffold a registry-shaped directory tree, and diff against the pinned official registry.

This package is the authoring CLI in the [ERC-7730 toolkit](https://github.com/MiltonTulli/ERC-7730). Runtime decoding lives in [`@erc7730/sdk`](https://www.npmjs.com/package/@erc7730/sdk).

This is **not** a catalog. Submit new protocol metadata to [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). The CLI will not open those PRs for you.

Generated drafts and Sourcify fallbacks are **never** `confidence: "high"`.

## Install

```bash
npm install -D @erc7730/cli
```

Requires Node 18+. npm also installs `@erc7730/sdk` and `viem` (the SDK runtime imports viem; the SDK lists that peer as optional, so the CLI depends on it directly). `@erc7730/sdk` and `@erc7730/cli` are versioned independently.

## CLI-only package

`@erc7730/cli` is a command-line package. The published public surface is the `erc7730` binary (`bin` → `dist/index.js`).

The manifest does **not** set `main`, `types`, or `exports`. Do not import this package from application code. Helpers used by this repository's tests are not a supported API.

```bash
erc7730 --help
erc7730 --version
erc7730 <command> --help
```

## Commands

```bash
erc7730 generate --chain-id 1 --address 0x... --abi ./abi.json --owner "My Protocol" [--url https://...] [--out ./calldata.json]
erc7730 lint ./calldata-Foo.json [--json]
erc7730 lint --tests ./testsv2/
erc7730 preview --data 0x... --to 0x... --chain-id 1 [--value <n>] [--pin <sha>]
erc7730 scaffold --chain-id 1 --address 0x... --abi ./abi.json --owner "My Protocol" --out ./draft
erc7730 diff ./calldata-Foo.json --against official [--pin <sha>]
erc7730 registry update [--pin <sha>] [--cache-dir <dir>]
```

### `generate`

Bootstrap a draft ERC-7730 v2 descriptor from a JSON ABI (an array, or `{ "abi": [...] }`). Pass `--abi -` to read the ABI from stdin.

| Flag | Required | Meaning |
| --- | --- | --- |
| `--chain-id` | yes | EIP-155 chain id |
| `--address` | yes | Contract address |
| `--abi` | yes | ABI file, or `-` for stdin |
| `--owner` | yes | Protocol / owner display name |
| `--url` | no | Protocol URL |
| `--out` | no | Also write the JSON to this path |

Stdout is the descriptor. The draft is a starting point for an official-registry PR. It validates as v2 and is never `confidence: "high"`.

### `lint`

Validate one or more descriptor files or directories against the official JSON Schema, then run local semantic checks (missing intent, empty formats, unresolved local `includes`). It does not call Etherscan or Sourcify.

```bash
erc7730 lint ./calldata-Foo.json ./more/
erc7730 lint ./calldata-Foo.json --json
erc7730 lint --tests ./testsv2/Foo.tests.json
```

`--tests` validates registry `testsv2` files against `specs/erc7730-tests-v2.schema.json`. `--json` prints a JSON report. The text report is one summary line per file plus `level`, JSON pointer, message, and rule.

### `preview`

Decode one transaction and print intent, interpolated intent, fields, and trust. Pass `--json` for the full `DecodedOperation` from `@erc7730/sdk`.

### `scaffold`

Write a registry-shaped directory (`calldata-<slug>.json` + `testsv2/<slug>.tests.json`) for an official-registry PR. Does not open the PR.

| Flag | Required | Meaning |
| --- | --- | --- |
| `--data` | yes | Calldata hex |
| `--to` | yes | Target address |
| `--chain-id` | yes | EIP-155 chain id |
| `--from` | no | Sender address |
| `--value` | no | Native value in wei. Negative values must be `--value=-1` (a separate `-1` token is parsed as a flag) |
| `--pin` | no | 40-character official-registry commit SHA |
| `--registry-path` | no | Local registry checkout |
| `--json` | no | Print `DecodedOperation` JSON |
| `--sourcify` | no | Allow the untrusted Sourcify / generated fallback |

### `diff`

Compare a local descriptor to the official registry file for the same deployment. `--against` defaults to `official` (the only supported target).

```bash
erc7730 diff ./calldata-Foo.json --against official --pin <sha>
erc7730 diff ./calldata-Foo.json --registry-path ./clear-signing-erc7730-registry
```

### `registry update`

Download `index.calldata.json`, `index.eip712.json`, and referenced descriptor files (including relative includes) into the local cache.

```text
~/.erc7730/registry/<pin>
```

Override the cache root with `--cache-dir` or `ERC7730_CACHE_DIR`. This command writes only under that cache. It does not modify `ERC7730_REGISTRY_PATH`.

## Registry pinning

Commands that read the official registry need a 40-character commit SHA. Resolution order:

1. `--pin`
2. `ERC7730_REGISTRY_PIN`
3. The SDK's vendored pin, when neither is set

`ERC7730_REGISTRY_PATH` points at a local checkout laid out like the GitHub tree (or at a cache directory from `registry update`) and is used to decode or diff offline. It is a read-side override. `registry update` does not write into that path.

Floating branch names (`master`, `main`) are not pins.

## Environment

| Variable | Meaning |
| --- | --- |
| `ERC7730_REGISTRY_PATH` | Local checkout of the official registry (paths as in the GitHub tree). Read-side only |
| `ERC7730_REGISTRY_PIN` | Default 40-character commit SHA pin |
| `ERC7730_CACHE_DIR` | Cache root (default `~/.erc7730`). `registry update` writes under this directory |

## Exit codes

| Code | When |
| --- | --- |
| 0 | Success. Also `--help` and `--version` |
| 1 | Usage error, unknown command, `lint` error-level issue (schema, missing file, unresolved local include), `generate` draft that fails v2 validation, `diff` with no matching official file or a differing intent/fields slice, `registry` invoked without `update` |

`lint` warnings (empty formats, missing intent) do not fail the process. Only error-level issues exit `1`.

With no arguments, `erc7730` prints help and exits `1`.

## Schema compatibility

| Package line | ERC-7730 schema |
| --- | --- |
| CLI 0.x | Lints v1 and v2. `generate` writes a v2 draft |

The ERC-7730 schema can move independently of this package's version. `0.x` is the CLI's semver line, not a schema version. See [RELEASE.md](https://github.com/MiltonTulli/ERC-7730/blob/main/RELEASE.md) for independent SDK/CLI versions and the `cli-vX.Y.Z` GitHub tag.

## Related

- [`@erc7730/sdk`](https://www.npmjs.com/package/@erc7730/sdk) — runtime (`validateDescriptor`, `decodeTransaction`, trust policies)
- [Toolkit README](https://github.com/MiltonTulli/ERC-7730#readme)
- Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) — authoring/firmware linter the official registry CI runs
