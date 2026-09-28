---
title: Authoring walkthrough
description: generate → lint → preview → scaffold for an official-registry PR.
---

Concrete flow for a protocol team next to a JS stack. Flags below exist on the published `erc7730` binary — see the [command reference](/ERC-7730/cli/generate/).

## 1. Generate a v2 draft from an ABI

Save a minimal ABI (or pass `--abi -` to read stdin):

```json
[
  {
    "type": "function",
    "name": "transfer",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "type": "bool" }]
  },
  {
    "type": "function",
    "name": "approve",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "type": "bool" }]
  }
]
```

```bash
erc7730 generate \
  --chain-id 1 \
  --address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --abi ./abi.json \
  --owner "USD Coin" \
  --url https://www.circle.com \
  --out ./calldata-usdc-draft.json
```

The draft validates as ERC-7730 v2 and is an **untrusted** starting point — never `confidence: "high"`.

## 2. Edit and lint

Edit intents, formats, and deployments. Then:

```bash
erc7730 lint ./calldata-usdc-draft.json
erc7730 lint --tests ./testsv2/   # if you maintain registry testsv2 files
```

Exit `1` on error-level issues. Warnings (empty formats, missing intent) do not fail the process. Lint does not call Etherscan / Sourcify.

## 3. Preview a call

Needs a 40-character `--pin` (or `ERC7730_REGISTRY_PIN`) or a local `ERC7730_REGISTRY_PATH` / prior `registry update`.

```bash
erc7730 registry update --pin 9f37816afde954ff6617fb5baa346133e5af26c5

erc7730 preview \
  --data 0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100 \
  --to 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --chain-id 1 \
  --pin 9f37816afde954ff6617fb5baa346133e5af26c5
```

Prints intent, `interpolatedIntent`, fields, and trust. Add `--json` for the full `DecodedOperation`. Add `--sourcify` only to explore the untrusted ABI fallback.

Negative native value must be `--value=-1`.

## 4. Scaffold a registry-shaped tree

```bash
erc7730 scaffold \
  --chain-id 1 \
  --address 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --abi ./abi.json \
  --owner "USD Coin" \
  --out ./draft-usdc
```

Writes `calldata-<slug>.json` and `testsv2/calldata-<slug>.tests.json`. Does **not** open a GitHub PR. Copy into a fork of [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry) and submit there. Use `--force` only when you intend to overwrite.

## 5. Diff against official (optional)

```bash
erc7730 diff ./calldata-usdc-draft.json --against official --pin 9f37816afde954ff6617fb5baa346133e5af26c5
```

Exit `1` when the comparable slice differs or no official file matches the deployment.

## Keep descriptors fresh in CI

See the [ABI vs descriptor](/ERC-7730/action/) snippet so an ABI change fails until the descriptor is updated.
