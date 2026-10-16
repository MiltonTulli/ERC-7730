---
"@erc7730/sdk": minor
---

Importing the SDK no longer compiles the JSON schemas or resolves the builtin token templates; both happen on first use, and descriptor and tests validation share one Ajv instance. `ox` is imported by subpath.

`createOfficialRegistry` keeps the last 256 resolved descriptors per commit pin, selector matching uses an index built once per descriptor, `extend()` overrides are looked up by deployment, and `mergeIncludes` copies the input once. Nested calls and `decodeBatch` calls decode in parallel.

Factory context matching now needs a bounded `fromBlock` (a block number or a tag other than `earliest`). Without one it is skipped and records `FACTORY_RANGE_UNBOUNDED` in diagnostics instead of scanning logs from genesis.
