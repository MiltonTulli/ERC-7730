---
"@erc7730/sdk": minor
---

Add ERC-7730 v2 types and JSON Schema `validateDescriptor()`. Valid v1 documents are accepted on read. This changes the `validateDescriptor` return shape from `{ valid, errors }` to `{ ok, descriptor, version } | { ok: false, errors }`.
