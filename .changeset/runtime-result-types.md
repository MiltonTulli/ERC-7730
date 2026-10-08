---
"@erc7730/sdk": minor
---

`DecodedField`, `SecurityWarning`, and `FieldFormat` exported from `@erc7730/sdk` are the types on `DecodedOperation`. The legacy module `types/erc7730.ts` is gone.

| If you used | It is now |
| --- | --- |
| `DecodedField` without `required` | `DecodedField` from the decoder, including `required` |
| `SecurityWarning.type` of `unusual_recipient`, `high_value`, `unknown_contract`, or `proxy_call` | the decoder union (`infinite_approval`, `untrusted_descriptor`, `ownership_change`, `proxy_upgrade`, and the rest of `SECURITY_WARNING_TYPES`) |
| `FieldFormat` including only the registry subset | the decoder `FieldFormat` (`addressName`, `amount`, `calldata`, and the other formats decode returns) |
| `DecodedTransaction` | `DecodedOperation` |
| `ERC7730Descriptor`, `ERC7730V2Descriptor`, `ContractContext`, `FunctionFormat`, `FieldDefinition` | `InputDescriptor`. The old aliases are not exported from the package root |
