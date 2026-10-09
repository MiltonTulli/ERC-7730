---
"@erc7730/sdk": minor
---

Public errors extend `Erc7730Error` and carry a stable `code`.

`OfficialRegistryError` codes are `REGISTRY_FETCH_FAILED`, `REGISTRY_NOT_FOUND`, `INVALID_PIN`, `INVALID_REF`, and `INDEX_MALFORMED`. HTTP 404 is `REGISTRY_NOT_FOUND`. Other fetch failures are `REGISTRY_FETCH_FAILED`.

`DescriptorResolveError` codes are `VALIDATION_FAILED`, `INCLUDE_NOT_FOUND`, `INCLUDE_CYCLE`, `INCLUDE_DEPTH`, and `REF_NOT_FOUND`. `issues` lists every validation issue. `resolveDescriptor` and `extend` on `createOfficialRegistry` and `createClearSigner` throw that error instead of the first issue only.

`PathResolveError` still uses `invalid`, `not_found`, and `missing_data`, and now extends `Erc7730Error`.

An include loader that throws `OfficialRegistryError` keeps that error. Other loader failures stay `INCLUDE_NOT_FOUND`. `resolveDescriptor` validates the merged document and reports every issue.

Proxy, factory, spender, and verified-ABI failures are recorded on `result.diagnostics` (`IMPLEMENTATION_LOOKUP_FAILED`, `FACTORY_LOGS_FAILED`, `SPENDER_LOOKUP_FAILED`, `VERIFIED_ABI_FAILED`) and no longer fail the decode.
