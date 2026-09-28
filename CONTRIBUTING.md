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
