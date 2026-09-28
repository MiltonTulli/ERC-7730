---
"@erc7730/sdk": patch
"@erc7730/cli": patch
---

Importing `@erc7730/sdk` no longer registers a Sourcify ABI loader. Opt in with `enableSourcifyAbiLoader()` or `loadVerifiedAbi: sourcifyVerifiedAbiLoader`, and set `useSourcifyFallback: true`. `erc7730 preview --sourcify` passes that loader.
