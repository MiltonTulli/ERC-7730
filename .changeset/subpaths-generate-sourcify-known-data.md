---
"@erc7730/sdk": minor
"@erc7730/cli": patch
---

Move authoring, Sourcify, and curated token and contract names off the root entry.

`generateDescriptor`, `generateFunctionDescriptor`, `inferIntent`, `inferFormat`, `inferLabel`, `looksLikeErc20`, `V2_SCHEMA_URI`, and `GENERATED_DESCRIPTOR_COMMENT` are `@erc7730/sdk/generate`.

`fetchFromSourcify`, `isVerifiedOnSourcify`, and `sourcifyVerifiedAbiLoader({ fetch, baseUrl })` are `@erc7730/sdk/sourcify`. The loader is a factory and attaches a draft descriptor. Pass `loadVerifiedAbi: sourcifyVerifiedAbiLoader()`.

`knownDataProvider()` is `@erc7730/sdk/known-data`. The decode core no longer applies `KNOWN_TOKENS` or `KNOWN_ADDRESSES`. A loader that returns only an ABI no longer gets a generated descriptor. The CLI imports the new subpaths.
