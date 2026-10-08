# @erc7730/cli

Authoring CLI for ERC-7730 descriptors next to a JavaScript stack.

[![npm version](https://img.shields.io/npm/v/@erc7730/cli.svg)](https://www.npmjs.com/package/@erc7730/cli)

**Docs:** [miltontulli.github.io/ERC-7730/cli](https://miltontulli.github.io/ERC-7730/cli/) · **Walkthrough:** [/cli/walkthrough](https://miltontulli.github.io/ERC-7730/cli/walkthrough/)

Runtime decoding lives in [`@erc7730/sdk`](https://www.npmjs.com/package/@erc7730/sdk) (independent version). This is **not** a catalog — submit metadata to [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). The CLI will not open those PRs. Generated drafts are never `confidence: "high"`.

## Install

```bash
npm install -D @erc7730/cli
erc7730 --help
```

Requires Node 20+. The published surface is the `erc7730` **binary only** (no `main` / `types` / `exports`). Do not import this package.

## Commands

```bash
erc7730 generate --chain-id 1 --address 0x... --abi ./abi.json --owner "My Protocol"
erc7730 lint ./calldata.json
erc7730 lint --tests ./testsv2/
erc7730 preview --data 0x... --to 0x... --chain-id 1 --pin <sha>
erc7730 scaffold --chain-id 1 --address 0x... --abi ./abi.json --owner "My Protocol" --out ./draft
erc7730 diff ./calldata.json --against official --pin <sha>
erc7730 registry update --pin <sha>
```

Optional flags (do not paste the brackets into a shell): `generate` `--url` `--out`; `lint` `--json`; `preview` `--from` `--value` `--json` `--sourcify` `--registry-path`; `scaffold` `--url` `--force`; `registry update` `--cache-dir`.

Flag details: `erc7730 <command> --help` or the [command reference](https://miltontulli.github.io/ERC-7730/cli/generate/) (generated from `help.ts`).

## Environment

| Variable | Meaning |
| --- | --- |
| `ERC7730_REGISTRY_PATH` | Local official-registry checkout (read-side) |
| `ERC7730_REGISTRY_PIN` | Default 40-character commit SHA |
| `ERC7730_CACHE_DIR` | Cache root (default `~/.erc7730`) |

Floating `main` / `master` are not pins.

## Schema

CLI 0.x lints v1 and v2. `generate` writes a v2 draft.

## License

MIT
