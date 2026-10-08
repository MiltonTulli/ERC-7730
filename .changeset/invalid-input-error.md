---
"@erc7730/sdk": minor
---

Malformed transactions and typed data throw `InvalidInputError` instead of a low-confidence decode. `TransactionInput.to` and `data` are hex strings. A missing EIP-712 chain id stays unset.
