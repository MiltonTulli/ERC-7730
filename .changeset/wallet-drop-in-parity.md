---
"@erc7730/sdk": minor
---

Wallet drop-in parity: `interpolatedIntent`, `decodeBatch` (EIP-5792), `ExternalDataProvider`, `trustedTokens` templates, ERC-8176 `attestedPolicy`, and `fetchPrebuiltRegistryIndex`. Decode defaults to offline (`useSourcifyFallback: false`); `@erc7730/sdk/lite` does not import the Sourcify or default-RPC clients.

**Breaking:** `ClearSigner.forChain` is removed; construct a viem `PublicClient` and pass it as `provider` to `createClearSigner`. `useSourcifyFallback` now defaults to `false`; pass `true` to keep the previous behavior.
