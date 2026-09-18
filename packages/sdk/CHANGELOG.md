# @erc7730/sdk

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
