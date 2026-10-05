---
"@erc7730/sdk": minor
---

Stop shipping the embedded registry. `Registry` no longer loads the historical `@erc7730/registry` snapshot. `useExternalRegistry` is removed and now throws. Look up descriptors with `createOfficialRegistry({ pin })`, or pass `indexes` and `cache` for offline use. Builtin ERC-20, ERC-721, and WETH descriptors stay. Ajv validation is unchanged.

The `abitype` drop (#78) ships in this same minor and does not change public parsed types.
