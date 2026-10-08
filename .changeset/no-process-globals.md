---
"@erc7730/sdk": minor
---

Signatures and the Sourcify ABI loader are no longer process globals. Pass `signatures` and `loadVerifiedAbi` on the decode call or on `createClearSigner`. `registerSignature`, `registerSignatures`, `clearCustomSignatures`, and `enableSourcifyAbiLoader` are removed.
