# @erc7730/sdk

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
