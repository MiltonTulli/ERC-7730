---
title: Validate, resolve, paths
description: validateDescriptor, resolveDescriptor, and the path engine (#. / $. / @.).
---

## `validateDescriptor`

Validates against the official ERC-7730 JSON Schema (v1 and v2). Returns `{ ok, descriptor, version }` or `{ ok: false, errors }` — it does not throw. Version comes from `$schema` (`erc7730-v1` / `erc7730-v2`); if omitted, v2 is tried then v1.

`validateDescriptorTests` validates registry `testsv2` files.

## `resolveDescriptor`

```ts
import { type IncludeLoader, type InputDescriptor, resolveDescriptor } from '@erc7730/sdk';

const input: InputDescriptor = {
  context: {
    contract: {
      deployments: [{ chainId: 1, address: '0x1111111111111111111111111111111111111111' }],
    },
  },
  metadata: { owner: 'Example' },
  display: { formats: {} },
};
const documents = new Map<string, InputDescriptor>();
const loader: IncludeLoader = {
  async load(ref) {
    const document = documents.get(ref);
    if (!document) throw new Error(`Include not found: ${ref}`);
    return document;
  },
};

const resolved = await resolveDescriptor(input, loader);
// { version, hash, input, merged, deployments }
```

- Merges `includes`, inlines field `$ref` under `$.display.definitions`, lowercases binding addresses.
- `descriptorHash` is keccak256 of sorted-key JSON with checksum addresses lowercased.
- Enum `params.$ref` is kept; format keys stay ABI fragments / EIP-712 `encodeType` strings (not converted to 4-byte selectors at resolve time).
- Fields merge by `path` (EIP overlay). Inject an `IncludeLoader` to load included documents.

Known differences vs Ledger `python-erc7730 resolve`: [divergences](/ERC-7730/divergences/).

## Path engine

`resolvePath(path, ctx)` reads:

| Root | Meaning |
| --- | --- |
| `#.` | Decoded args or EIP-712 message |
| `$.` | Merged descriptor |
| `@.` | Envelope: `from` / `to` / `value` / `chainId` only |

Rootless paths are `#.` unless `ctx.base` is set for nested `tokenPath` / `collectionPath`. Missing paths throw `PathResolveError` (`not_found` / `invalid` / `missing_data`).

## See also

- [`validateDescriptor`](/ERC-7730/sdk/api/functions/validatedescriptor/)
- [`resolveDescriptor`](/ERC-7730/sdk/api/functions/resolvedescriptor/)
- [`resolvePath`](/ERC-7730/sdk/api/functions/resolvepath/)
- [Golden / divergences](/ERC-7730/divergences/)
