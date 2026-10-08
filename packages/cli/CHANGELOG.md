# @erc7730/cli

## 0.3.10

### Patch Changes

- d06db11: Published `@erc7730/sdk` and `@erc7730/cli` require Node.js 20 or newer. Building this repository still needs Node.js 22.18 or newer.
- f5ebc52: Omitted `trust` is now `officialOnlyPolicy()` on `decodeTransaction`, `decodeTypedData`, `decodeBatch`, `decodeUserOp`, `format`, and `formatTypedData`. The `policy: "unspecified"` stub is gone.

  If you relied on local overrides being accepted without a policy, pass `trust: officialOrLocalPolicy()`.

  `format` / `formatTypedData` are deprecated aliases of `decode*` and use the same default. `erc7730 preview` prints `official-only` instead of `unspecified`.

- Updated dependencies [0a8074a]
- Updated dependencies [63fdb50]
- Updated dependencies [d06db11]
- Updated dependencies [3a44727]
- Updated dependencies [c6934d0]
- Updated dependencies [f5ebc52]
- Updated dependencies [1d04ce9]
- Updated dependencies [4cf3bc3]
- Updated dependencies [a8a1e3d]
- Updated dependencies [bff686f]
- Updated dependencies [48321da]
  - @erc7730/sdk@0.10.0

## 0.3.9

### Patch Changes

- 1fe0fd8: preview prints the registry pin it used, and diff exits with a clear error when a descriptor has no deployments.
- Updated dependencies [9f32fee]
- Updated dependencies [d85c365]
  - @erc7730/sdk@0.9.1

## 0.3.8

### Patch Changes

- Updated dependencies [df46c87]
  - @erc7730/sdk@0.9.0

## 0.3.7

### Patch Changes

- Updated dependencies [95683f2]
  - @erc7730/sdk@0.8.1

## 0.3.6

### Patch Changes

- Updated dependencies [e2b84aa]
  - @erc7730/sdk@0.8.0

## 0.3.5

### Patch Changes

- d7ab7c5: Unify descriptor input types on the official v2 schema (`InputDescriptor`), with codegen and deprecated aliases for `ERC7730Descriptor` / `ERC7730V2Descriptor`.
- Updated dependencies [d7ab7c5]
  - @erc7730/sdk@0.7.0

## 0.3.4

### Patch Changes

- Updated dependencies [68bcbc0]
  - @erc7730/sdk@0.6.3

## 0.3.3

### Patch Changes

- 3a9dd6f: Importing `@erc7730/sdk` no longer registers a Sourcify ABI loader. Opt in with `enableSourcifyAbiLoader()` or `loadVerifiedAbi: sourcifyVerifiedAbiLoader`, and set `useSourcifyFallback: true`. `erc7730 preview --sourcify` passes that loader.
- Updated dependencies [3a9dd6f]
  - @erc7730/sdk@0.6.2

## 0.3.2

### Patch Changes

- 66ee78c: Emit `@erc7730/sdk` and `@erc7730/cli` with tsdown instead of `tsc`. Source imports are extensionless. No intentional runtime API change.
- Updated dependencies [66ee78c]
  - @erc7730/sdk@0.6.1

## 0.3.1

### Patch Changes

- a5393bc: Document `--sourcify` on `erc7730 preview --help` so help matches the published flag.

## 0.3.0

### Minor Changes

- 1947692: v0.6 coverage, policies, and authoring: Multicall3 / Safe CALL `children[]`, `decodeUserOp` (Simple Account), EIP-712 domain-only `extend()` match, stable trust reason codes, spender allowlist, `format` / `formatTypedData` compat aliases, CLI `scaffold` + `lint --tests` + preview trust/interpolatedIntent, and `docs/interop.md`.

### Patch Changes

- Updated dependencies [1947692]
  - @erc7730/sdk@0.6.0

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
