# @erc7730/sdk

## 0.12.0

### Minor Changes

- af3480d: Public errors extend `Erc7730Error` and carry a stable `code`.
  
  `OfficialRegistryError` codes are `REGISTRY_FETCH_FAILED`, `REGISTRY_NOT_FOUND`, `INVALID_PIN`, `INVALID_REF`, and `INDEX_MALFORMED`. HTTP 404 is `REGISTRY_NOT_FOUND`. Other fetch failures are `REGISTRY_FETCH_FAILED`.
  
  `DescriptorResolveError` codes are `VALIDATION_FAILED`, `INCLUDE_NOT_FOUND`, `INCLUDE_CYCLE`, `INCLUDE_DEPTH`, and `REF_NOT_FOUND`. `issues` lists every validation issue. `resolveDescriptor` and `extend` on `createOfficialRegistry` and `createClearSigner` throw that error instead of the first issue only.
  
  `PathResolveError` still uses `invalid`, `not_found`, and `missing_data`, and now extends `Erc7730Error`.
  
  An include loader that throws `OfficialRegistryError` keeps that error. Other loader failures stay `INCLUDE_NOT_FOUND`. `resolveDescriptor` validates the merged document and reports every issue.
  
  Proxy, factory, spender, and verified-ABI failures are recorded on `result.diagnostics` (`IMPLEMENTATION_LOOKUP_FAILED`, `FACTORY_LOGS_FAILED`, `SPENDER_LOOKUP_FAILED`, `VERIFIED_ABI_FAILED`) and no longer fail the decode.
- 34d438b: Move deprecated root values to `@erc7730/sdk/legacy`.
  
  `ClearSigner`, `getDefaultClearSignRegistry`, `format`, `formatTypedData`, `Registry`, `decodeCalldata`, `extractSelector`, the signature helpers, amount and address formatters, `resolveImplementation`, `EIP1967_IMPLEMENTATION_SLOT`, `createMemoryIncludeLoader`, `isCommitSha`, `toCaip10`, and the official registry URL constants are `@deprecated` and removed in 1.0.
  
  `calldataDepth` and `nestedDepth` are no longer public `DecodeOptions` fields. `BatchDecodeResult.warnings` lists the child warnings, deduped by `type` and `path`.
  
  Removed with no replacement: `isContract`, `intentFromFormat`, `Registry.getAll`, `Registry.getStats`, `Provider.getEnsAddress`, `Provider.chain`, `ExternalDataProvider.chainClient`, `RegistryConfig`, and `ChainName`. `attestedPolicy` stays on `@erc7730/sdk/attest`.
  
  The CLI imports `isCommitSha` from `@erc7730/sdk/legacy`.
  
  API Extractor reports for the root entry and for `legacy`, `attest`, `generate`, `sourcify`, and `known-data` are committed under `api/`.
- 165ede7: Trust reason codes and the `no_trusted_attestation` warning are snake_case. `TrustReport.reasons` is `TrustReasonCode[]`.
  
  | Before | After |
  | --- | --- |
  | `source:official-registry:accepted` | `source_official_registry_accepted` |
  | `source:<source>:rejected` | `source_<source>_rejected` (`official_registry`, `local_override`, `trusted_token`, and the other sources) |
  | `ATTESTED` | `attested` |
  | `NO_TRUSTED_ATTESTATION` | `no_trusted_attestation` (reason and `SecurityWarning.type`) |
  | `ATTESTATION_OPTIONS_INCOMPLETE` | `attestation_options_incomplete` |
  
  `untrusted_descriptor` and `no_policies` are unchanged. The other `SECURITY_WARNING_TYPES` were already snake_case.
- 737c42c: Move authoring, Sourcify, and curated token and contract names off the root entry.
  
  `generateDescriptor`, `generateFunctionDescriptor`, `inferIntent`, `inferFormat`, `inferLabel`, `looksLikeErc20`, `V2_SCHEMA_URI`, and `GENERATED_DESCRIPTOR_COMMENT` are `@erc7730/sdk/generate`.
  
  `fetchFromSourcify`, `isVerifiedOnSourcify`, and `sourcifyVerifiedAbiLoader({ fetch, baseUrl })` are `@erc7730/sdk/sourcify`. The loader is a factory and attaches a draft descriptor. Pass `loadVerifiedAbi: sourcifyVerifiedAbiLoader()`.
  
  `knownDataProvider()` is `@erc7730/sdk/known-data`. The decode core no longer applies `KNOWN_TOKENS` or `KNOWN_ADDRESSES`. A loader that returns only an ABI no longer gets a generated descriptor. The CLI imports the new subpaths.

## 0.11.0

### Minor Changes

- ef6d269: Add `clearSign()`, confirmation screens, and a diagnostic chain.
  
  `clearSign` decodes a transaction, EIP-712 typed data, an EIP-5792 batch, or a Simple Account user operation and attaches `screens` from `toScreens()`. With no registry it uses one official-registry client pinned to the vendored commit. `DecodedField` is a union on `format`. Structured values live on `details`. A calldata field's nested operation is `details.embedded` when `format` is `calldata`. `required` is `true` for an explicit required path and `'implicit'` when the format lists none. `diagnostics` records registry, context, format, include, and trust steps on every decode, including a hit. `onEvent` reports decode, registry cache, trust, and warning events for that call. `erc7730 preview --explain` prints the diagnostic chain.

### Patch Changes

- ce3749c: Parse EIP-712 array suffixes with a linear scan so an untrusted type string cannot trigger polynomial backtracking.

## 0.10.0

### Minor Changes

- 0a8074a: ERC-20, ERC-721, and WETH builtins are the fallback when no registry descriptor matches. The source is `builtin`. `officialOnlyPolicy()` rejects it (`confidence: "low"`). `officialOrLocalPolicy()` accepts it at `medium`. It is never `high`. WETH matches only its own deployments. Pass `builtins: false` to skip them.
- 63fdb50: `viem` is no longer a dependency of the root entry. Keccak is `@noble/hashes` and the ABI codec is `ox`. `attestedPolicy` is imported from `@erc7730/sdk/attest`, which can depend on `viem`. RPC helpers (`getChain`, `getDefaultRpc`, and the rest) are removed.
- d06db11: Published `@erc7730/sdk` and `@erc7730/cli` require Node.js 20 or newer. Building this repository still needs Node.js 22.18 or newer.
- 3a44727: Malformed transactions and typed data throw `InvalidInputError` instead of a low-confidence decode. `TransactionInput.to` and `data` are hex strings. A missing EIP-712 chain id stays unset.
- c6934d0: Signatures and the Sourcify ABI loader are no longer process globals. Pass `signatures` and `loadVerifiedAbi` on the decode call or on `createClearSigner`. `registerSignature`, `registerSignatures`, `clearCustomSignatures`, and `enableSourcifyAbiLoader` are removed.
- f5ebc52: Omitted `trust` is now `officialOnlyPolicy()` on `decodeTransaction`, `decodeTypedData`, `decodeBatch`, `decodeUserOp`, `format`, and `formatTypedData`. The `policy: "unspecified"` stub is gone.

  If you relied on local overrides being accepted without a policy, pass `trust: officialOrLocalPolicy()`.

  `format` / `formatTypedData` are deprecated aliases of `decode*` and use the same default. `erc7730 preview` prints `official-only` instead of `unspecified`.

- 1d04ce9: The decoder resolves field paths with the strict path engine. `decode/path.ts` is gone, so there is one `resolvePath` and one `PathResolveError`. Missing fields stay empty via `tryResolvePath`. Invalid paths throw.
- 4cf3bc3: Prototype keys are dropped while merging descriptors and naming decoded arguments. `createOfficialRegistry({ ref })` rejects `..`, empty segments, and characters outside a safe path. Sourcify URLs are built only for an integer chain id and a 20-byte address. `attestedPolicy` reads `DecodeOptions.now` instead of the process clock.
- a8a1e3d: `@erc7730/sdk/lite` and `@erc7730/sdk/viem` are removed. Import `decodeViemTypedData` from `@erc7730/sdk`. `decodeViemTransaction` is removed; use `decodeTransaction`.
- bff686f: `DecodedField`, `SecurityWarning`, and `FieldFormat` exported from `@erc7730/sdk` are the types on `DecodedOperation`. The legacy module `types/erc7730.ts` is gone.

  | If you used                                                                                        | It is now                                                                                                                                      |
  | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
  | `DecodedField` without `required`                                                                  | `DecodedField` from the decoder, including `required`                                                                                          |
  | `SecurityWarning.type` of `unusual_recipient`, `high_value`, `unknown_contract`, or `proxy_call`   | the decoder union (`infinite_approval`, `untrusted_descriptor`, `ownership_change`, `proxy_upgrade`, and the rest of `SECURITY_WARNING_TYPES`) |
  | `FieldFormat` including only the registry subset                                                   | the decoder `FieldFormat` (`addressName`, `amount`, `calldata`, and the other formats decode returns)                                          |
  | `DecodedTransaction`                                                                               | `DecodedOperation`                                                                                                                             |
  | `ERC7730Descriptor`, `ERC7730V2Descriptor`, `ContractContext`, `FunctionFormat`, `FieldDefinition` | `InputDescriptor`. The old aliases are not exported from the package root                                                                      |

- 48321da: Vendored JSON is typed by the compiler. `VENDORED_REGISTRY_COMMIT` is `source.commit`. The catch-all `json.d.ts` module is gone.

## 0.9.1

### Patch Changes

- 9f32fee: Inferred calldata for well-known signatures uses readable argument labels instead of Param 1.
- d85c365: viem is now a regular dependency; it was always required at runtime.

## 0.9.0

### Minor Changes

- df46c87: Make `createOfficialRegistry` pin optional. An omitted pin defaults to `VENDORED_REGISTRY_COMMIT` (a commit SHA), not `master`. Floating branches or tags require an explicit `ref` (for example `{ ref: "master" }`). A malformed `pin` still throws. Production wallets should keep passing an explicit SHA.

## 0.8.1

### Patch Changes

- 95683f2: Parse ABI signatures with the SDK's own parser. `@erc7730/sdk` no longer depends on `abitype`.

## 0.8.0

### Minor Changes

- e2b84aa: Stop shipping the embedded registry. `Registry` no longer loads the historical `@erc7730/registry` snapshot. `useExternalRegistry` is removed and now throws. Look up descriptors with `createOfficialRegistry({ pin })`, or pass `indexes` and `cache` for offline use. Builtin ERC-20, ERC-721, and WETH descriptors stay. Ajv validation is unchanged. The package sets `sideEffects: false`. Importing it does not register a loader or other global.

## 0.7.0

### Minor Changes

- d7ab7c5: Unify descriptor input types on the official v2 schema (`InputDescriptor`), with codegen and deprecated aliases for `ERC7730Descriptor` / `ERC7730V2Descriptor`.

## 0.6.3

### Patch Changes

- 68bcbc0: Type the minified embedded registry so a malformed catalog fails typecheck, and drop `any` from the embed loader.

## 0.6.2

### Patch Changes

- 3a9dd6f: Importing `@erc7730/sdk` no longer registers a Sourcify ABI loader. Opt in with `enableSourcifyAbiLoader()` or `loadVerifiedAbi: sourcifyVerifiedAbiLoader`, and set `useSourcifyFallback: true`. `erc7730 preview --sourcify` passes that loader.

## 0.6.1

### Patch Changes

- 66ee78c: Emit `@erc7730/sdk` and `@erc7730/cli` with tsdown instead of `tsc`. Source imports are extensionless. No intentional runtime API change.

## 0.6.0

### Minor Changes

- 1947692: v0.6 coverage, policies, and authoring: Multicall3 / Safe CALL `children[]`, `decodeUserOp` (Simple Account), EIP-712 domain-only `extend()` match, stable trust reason codes, spender allowlist, `format` / `formatTypedData` compat aliases, CLI `scaffold` + `lint --tests` + preview trust/interpolatedIntent, and `docs/interop.md`.

## 0.5.0

### Minor Changes

- e7d7301: Wallet drop-in parity: `interpolatedIntent`, `decodeBatch` (EIP-5792), `ExternalDataProvider`, `trustedTokens` templates, ERC-8176 `attestedPolicy`, and `fetchPrebuiltRegistryIndex`. Decode defaults to offline (`useSourcifyFallback: false`); `@erc7730/sdk/lite` does not import the Sourcify or default-RPC clients.

  **Breaking:** `ClearSigner.forChain` is removed; construct a viem `PublicClient` and pass it as `provider` to `createClearSigner`. `useSourcifyFallback` now defaults to `false`; pass `true` to keep the previous behavior.

## 0.4.0

### Minor Changes

- 1c82ce4: `generateDescriptor()` now emits a draft ERC-7730 v2 file with ABI heuristics (`tokenAmount` + `@.to` on ERC-20, `date` timestamps, `addressName`, Solidity `metadata.enums`) and a TODO `$comment`. Output validates as v2 and is never a high-confidence runtime source. Authors still need to edit intents before an official-registry PR.
- a938246: Add `@erc7730/sdk/viem` with `decodeViemTransaction` and `decodeViemTypedData` adapters, readonly and domain-only typed-data support, and viem/wagmi integration examples. The separate entry point preserves core decode options and trust results without adding runtime viem imports to the adapter. Existing core viem dependencies remain unchanged.

## 0.3.0

### Minor Changes

- 5aa438d: Breaking (0.3): primary decode API is `decodeTransaction` / `decodeTypedData` plus `createClearSigner(options?)`. `ClearSigner.decode` is a deprecated alias of `decodeTransaction` and now returns `DecodedOperation`.

  ```ts
  // before
  const signer = new ClearSigner();
  const result = await signer.decode(tx); // DecodedTransaction (v1)

  // after
  import {
    createClearSigner,
    createOfficialRegistry,
    decodeTransaction,
    officialOnlyPolicy,
  } from "@erc7730/sdk";

  const registry = createOfficialRegistry({ pin: "<commit sha>" });
  const result = await decodeTransaction(tx, {
    registry,
    trust: officialOnlyPolicy(),
  });

  // or bind options
  const signer = createClearSigner({ registry, trust: officialOnlyPolicy() });
  await signer.decodeTransaction(tx);
  await signer.decodeTypedData(typedData);
  // signer.decode(tx) still works for one minor
  ```

- 7d3fb3c: Add `decodeTransaction()` to render intent and formatted fields from official (or override) descriptors, plus a `#` / `$` / `@` path engine.
- 81534a4: Add `decodeTypedData()` to render EIP-712 payloads from the official eip712 index (Permit + encodeType disambiguation).
- 9329a74: Expand decode security warnings (`untrusted_spender`, `ownership_change`, `proxy_upgrade`, `selector_mismatch`, `missing_metadata`) with severity and user-facing messages.
- 68ace56: Match ERC-7730 v2 context (`deployments`, `factory.deployEvent`, EIP-1967 / EIP-1167 proxies) before applying a descriptor.
- 8e10384: Add `resolvePath()` for ERC-7730 `#`, `$`, and `@` path roots (nested structs, arrays, slices, and relative tokenPath / collectionPath).
- b5b2b22: Add pluggable TrustPolicy (`officialOnlyPolicy`, `officialOrLocalPolicy`, `composePolicies`) so wallets decide which descriptors to accept. Registry `extend()` hits are tagged `local-override`.

## 0.2.1

### Patch Changes

- ae5f34a: Dummy release to verify unattended publish.

## 0.2.0

### Minor Changes

- 3cff5b6: Add ERC-7730 v2 types and JSON Schema `validateDescriptor()`. Valid v1 documents are accepted on read. This changes the `validateDescriptor` return shape from `{ valid, errors }` to `{ ok, descriptor, version } | { ok: false, errors }`.
- 0801348: Add `createOfficialRegistry()` to look up official descriptors from `index.calldata.json` and `index.eip712.json`, pinned by commit SHA.
- 4528781: Add `resolveDescriptor()` and `descriptorHash()`. Official includes are merged, field `$ref`s are inlined, and the canonical keccak256 is stable across runtimes.

### Patch Changes

- 92f43ac: Pin publint and @arethetypeswrong/cli as SDK devDependencies so CI does not float those CLIs.
