---
"@erc7730/sdk": minor
---

`viem` is no longer a dependency of the root entry. Keccak is `@noble/hashes` and the ABI codec is `ox`. `attestedPolicy` is imported from `@erc7730/sdk/attest`, which can depend on `viem`. RPC helpers (`getChain`, `getDefaultRpc`, and the rest) are removed.
