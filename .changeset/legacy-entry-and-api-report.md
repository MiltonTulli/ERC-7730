---
"@erc7730/sdk": minor
"@erc7730/cli": patch
---

Move deprecated root values to `@erc7730/sdk/legacy`.

`ClearSigner`, `getDefaultClearSignRegistry`, `format`, `formatTypedData`, `Registry`, `decodeCalldata`, `extractSelector`, the signature helpers, amount and address formatters, `resolveImplementation`, `EIP1967_IMPLEMENTATION_SLOT`, `createMemoryIncludeLoader`, `isCommitSha`, `toCaip10`, and the official registry URL constants are `@deprecated` and removed in 1.0.

`calldataDepth` and `nestedDepth` are no longer public `DecodeOptions` fields. `BatchDecodeResult.warnings` lists the child warnings, deduped by `type` and `path`.

Removed with no replacement: `isContract`, `intentFromFormat`, `Registry.getAll`, `Registry.getStats`, `Provider.getEnsAddress`, `Provider.chain`, `ExternalDataProvider.chainClient`, `RegistryConfig`, and `ChainName`. `attestedPolicy` stays on `@erc7730/sdk/attest`.

The CLI imports `isCommitSha` from `@erc7730/sdk/legacy`.

API Extractor reports for the root entry and for `legacy`, `attest`, `generate`, `sourcify`, and `known-data` are committed under `api/`.
