# Protocol CI: ABI vs descriptor stale

Optional snippet for a protocol repo that owns an ERC-7730 descriptor destined for [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).

Goal: when the on-chain ABI (or the checked-in ABI artifact) changes, fail CI until the descriptor is updated. This does **not** open a PR against the official registry.

```yaml
name: erc7730-descriptor
on:
  pull_request:
  push:
    paths:
      - 'abi/**'
      - 'erc7730/**'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm add -g @erc7730/cli
      - name: Lint descriptor
        run: erc7730 lint erc7730/calldata-*.json
      - name: Lint testsv2 (if present)
        run: |
          if [ -d erc7730/testsv2 ]; then
            erc7730 lint --tests erc7730/testsv2
          fi
      - name: ABI fingerprint vs descriptor comment
        run: |
          # Example: store the keccak of the ABI next to the descriptor and
          # fail when it drifts. Replace paths with your layout.
          ABI_HASH=$(node -e "const fs=require('fs');const {keccak256,toBytes}=require('viem');const abi=fs.readFileSync('abi/Contract.json');process.stdout.write(keccak256(toBytes(abi)))")
          grep -q "$ABI_HASH" erc7730/calldata-*.json \
            || (echo "ABI changed — update the ERC-7730 descriptor (and the embedded ABI hash comment)" && exit 1)
```

Authoring flow: `erc7730 generate` → edit → `erc7730 lint` → `erc7730 preview --pin <sha>` → `erc7730 scaffold` (or copy into a registry fork) → open the PR on the official registry yourself.
