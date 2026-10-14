# Protocol CI

Optional snippets for a protocol repo that owns an ERC-7730 descriptor destined for [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).

These workflows do **not** open a PR against the official registry.

## ABI vs descriptor stale

Goal: when the on-chain ABI (or the checked-in ABI artifact) changes, fail CI until the descriptor is updated.

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
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @erc7730/cli
      - name: Lint descriptor
        run: erc7730 lint erc7730/calldata-*.json
      - name: Lint testsv2 (if present)
        run: |
          if [ -d erc7730/testsv2 ]; then
            erc7730 lint --tests erc7730/testsv2
          fi
      - name: ABI fingerprint vs descriptor comment
        run: |
          # Example: store a SHA-256 of the ABI next to the descriptor and
          # fail when it drifts. Replace paths with your layout.
          # Uses Node crypto (no viem / lockfile required in the protocol repo).
          ABI_HASH=$(node -e "const fs=require('fs');const crypto=require('crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync('abi/Contract.json')).digest('hex'))")
          grep -q "$ABI_HASH" erc7730/calldata-*.json \
            || (echo "ABI changed — update the ERC-7730 descriptor (and the embedded ABI hash comment)" && exit 1)
```

## testsv2 screens in the job summary

`erc7730 test` decodes each case, prints the confirmation screen, and exits 1 when `expected` does not match the intent, owner, or fields. A descriptor loaded from the working tree is a local override, so the screen title is prefixed with `Unverified`.

`--reporter github` prints a workflow annotation for each failed case (`::error file=…,line=…::`). Actions turns those lines into checks on the pull request. The same run appends a Markdown summary of every screen to `GITHUB_STEP_SUMMARY`, which Actions sets for the job, and prints that Markdown in the log.

Omit `--tests` when the file sits at `testsv2/<descriptor-name>.tests.json` next to the descriptor.

```yaml
name: erc7730-tests
on:
  pull_request:
  push:
    paths:
      - 'erc7730/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @erc7730/cli
      - name: Run descriptor tests
        run: |
          erc7730 test erc7730/calldata-example.json \
            --tests erc7730/testsv2/calldata-example.tests.json \
            --reporter github
```

Authoring flow: `erc7730 generate` → edit → `erc7730 lint` → `erc7730 test` → `erc7730 preview --pin <sha>` → `erc7730 scaffold` (or copy into a registry fork) → open the PR on the official registry yourself.
