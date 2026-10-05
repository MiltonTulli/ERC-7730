# Contributing

SDK and CLI source use extensionless relative imports. The file on disk is still `.ts`.

```ts
import { decodeTransaction } from './decode/decodeTransaction';
import { validateDescriptor } from './schema';
```

Do not write `.js` or `.ts` in a relative specifier, and do not add `@/` aliases.

Do not edit `dist/`. `pnpm --filter @erc7730/sdk build` writes the embedded registry and runs tsdown. `pnpm --filter @erc7730/cli build` runs tsdown. Consumers import `@erc7730/sdk`, `@erc7730/sdk/lite`, or `@erc7730/sdk/viem`. The `.js` files in `dist/` are the published runtime, not the authoring API.

Building this repository needs Node 22.18 or newer. The published packages still run on Node 18 or newer.

The CLI imports `@erc7730/sdk` through its package exports, which point at `dist/`. Build the SDK before typechecking the CLI. Do not import `packages/sdk/src` from the CLI.

## Descriptor input types

`InputDescriptor` is the sole TypeScript model for ERC-7730 documents the SDK accepts. It is generated from `packages/sdk/src/schema/official/erc7730-v2.schema.json` into `packages/sdk/src/types/generated/erc7730-v2.ts`.

After updating the vendored official schemas, regenerate types:

```bash
pnpm schema:types
```

Do not hand-edit the generated file. `ERC7730Descriptor` and `ERC7730V2Descriptor` remain deprecated aliases of `InputDescriptor` for one minor. `@erc7730/registry` only types the JSON catalog index; it does not define a parallel descriptor dialect.
