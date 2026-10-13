---
'@erc7730/sdk': patch
---

Smaller published graph: the build drops annotation keywords (`title`, `description`, `$comment`, `examples`) from the bundled JSON schemas, and shared code is split so no `dist` chunk is over 100 KB. Nested-call decoding no longer uses a dynamic `import()` of the transaction decoder, which removes the `INEFFECTIVE_DYNAMIC_IMPORT` build warning. Validation results are unchanged.
