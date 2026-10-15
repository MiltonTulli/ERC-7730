---
"@erc7730/sdk": major
"@erc7730/cli": patch
---

Remove the SDK compatibility entry and its deprecated aliases, including the bound signer's `decode` method. Use `createClearSigner`, `decodeTransaction`, `decodeTypedData`, and schema-derived input types instead. The CLI validates registry pins without importing the removed entry.

Generate `docs/migrating-to-1.0.md` from the shipped 0.12 API reports and the current reports, with replacements for every removed symbol. Reject deprecated declarations and removed entry points in the SDK bundle check.
