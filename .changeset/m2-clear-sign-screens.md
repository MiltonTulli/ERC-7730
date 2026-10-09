---
"@erc7730/sdk": minor
"@erc7730/cli": minor
---

Add `clearSign()`, confirmation screens, and a diagnostic chain.

`clearSign` decodes a transaction, EIP-712 typed data, an EIP-5792 batch, or a Simple Account user operation and attaches `screens` from `toScreens()`. With no registry it uses one official-registry client pinned to the vendored commit. `DecodedField` is a union on `format`. Structured values live on `details`. A calldata field's nested operation is `details.embedded` when `format` is `calldata`. `required` is `true` for an explicit required path and `'implicit'` when the format lists none. `diagnostics` records registry, context, format, include, and trust steps on every decode, including a hit. `onEvent` reports decode, registry cache, trust, and warning events for that call. `erc7730 preview --explain` prints the diagnostic chain.
