---
"@erc7730/sdk": minor
---

Prototype keys are dropped while merging descriptors and naming decoded arguments. `createOfficialRegistry({ ref })` rejects `..`, empty segments, and characters outside a safe path. Sourcify URLs are built only for an integer chain id and a 20-byte address. `attestedPolicy` reads `DecodeOptions.now` instead of the process clock.
