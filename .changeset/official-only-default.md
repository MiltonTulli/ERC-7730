---
"@erc7730/sdk": minor
"@erc7730/cli": patch
---

Omitted `trust` is now `officialOnlyPolicy()` on `decodeTransaction`, `decodeTypedData`, `decodeBatch`, `decodeUserOp`, `format`, and `formatTypedData`. The `policy: "unspecified"` stub is gone.

If you relied on local overrides being accepted without a policy, pass `trust: officialOrLocalPolicy()`.

`format` / `formatTypedData` are deprecated aliases of `decode*` and use the same default. `erc7730 preview` prints `official-only` instead of `unspecified`.
