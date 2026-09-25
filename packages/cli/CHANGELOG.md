# @erc7730/cli

## 0.2.1

### Patch Changes

- Updated dependencies [e7d7301]
  - @erc7730/sdk@0.5.0

## 0.2.0

### Minor Changes

- 3c96bcd: `@erc7730/cli` is a command-line package. The published manifest keeps the `erc7730` binary and no longer exposes `main`, `types`, or `exports`. `viem` is a direct dependency so the installed binary can load the SDK, which imports viem at runtime and only lists it as an optional peer. `erc7730 generate --abi -` reads the ABI JSON from stdin. Help and other commands do not wait for stdin.
- 1c82ce4: `generateDescriptor()` now emits a draft ERC-7730 v2 file with ABI heuristics (`tokenAmount` + `@.to` on ERC-20, `date` timestamps, `addressName`, Solidity `metadata.enums`) and a TODO `$comment`. Output validates as v2 and is never a high-confidence runtime source. Authors still need to edit intents before an official-registry PR.

### Patch Changes

- Updated dependencies [1c82ce4]
- Updated dependencies [a938246]
  - @erc7730/sdk@0.4.0

## 0.1.0

### Minor Changes

- 4359401: Initial `@erc7730/cli`: `erc7730 generate` / `lint` / `preview` / `diff` plus `registry update`. Generate writes v2-valid drafts; lint exits 1 on errors; preview prints intent + fields.
