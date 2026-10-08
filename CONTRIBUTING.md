# Contributing

SDK and CLI source use extensionless relative imports. The file on disk is still `.ts`.

```ts
import { decodeTransaction } from './decode/decodeTransaction';
import { validateDescriptor } from './schema';
```

Do not write `.js` or `.ts` in a relative specifier, and do not add `@/` aliases.

Do not edit `dist/`. `pnpm --filter @erc7730/sdk build` and `pnpm --filter @erc7730/cli build` run tsdown. Consumers import `@erc7730/sdk`. The `.js` files in `dist/` are the published runtime, not the authoring API.

Building this repository needs Node 22.18 or newer. The published packages run on Node 20 or newer.

The CLI imports `@erc7730/sdk` through its package exports, which point at `dist/`. Build the SDK before typechecking the CLI. Do not import `packages/sdk/src` from the CLI.

## Tests

```bash
pnpm test
pnpm --filter @erc7730/sdk test
pnpm --filter @erc7730/cli test
pnpm --filter @erc7730/sdk test:coverage
```

Coverage thresholds live in `packages/sdk/vitest.config.ts`. CI runs that command and uploads `lcov.info`. Do not lower the thresholds to make a change pass.

## Changesets

A changeset is required when a pull request touches published SDK or CLI source:

- `packages/sdk/src/**` (tests excluded)
- `packages/sdk/package.json`
- `packages/cli/src/**` (tests excluded)
- `packages/cli/package.json`
- `packages/*/tsdown.config.ts`
- `packages/sdk/scripts/**`

```bash
pnpm changeset
```

On 0.x, `minor` is the usual feature bump. Docs, workflows, the web demo, and the private registry package do not need a changeset. Do not hand-edit `packages/sdk/CHANGELOG.md` or `packages/cli/CHANGELOG.md`. The Version PR writes them.

## Descriptor input types

`InputDescriptor` is the sole TypeScript model for ERC-7730 documents the SDK accepts. It is generated from `packages/sdk/src/schema/official/erc7730-v2.schema.json` into `packages/sdk/src/types/generated/erc7730-v2.ts`.

After updating the vendored official schemas, regenerate types:

```bash
pnpm schema:types
```

Do not hand-edit the generated file. `InputDescriptor` is the only public input type. The old `ERC7730*` aliases live in `packages/sdk/src/legacy.ts` and are not exported from the package root. `@erc7730/registry` only types the JSON catalog index; it does not define a parallel descriptor dialect.

## Docs site

The quick start is `docs/snippets/quickstart.ts`. `packages/docs/scripts/include-canonical.mjs` copies that file into the root README, the SDK README, the site home, the SDK overview, and `docs/GUIDE.md`. Edit the snippet, then run the script. Do not edit the fenced copies by hand.

Canonical prose for the guide, trust table, interop, divergences, and the GitHub Action lives under `docs/`. The site build copies it.

Build the SDK first (`pnpm build`), then:

```bash
pnpm docs:site
```

That command typechecks the quick start against `packages/sdk/dist` and builds the Starlight site. Preview with `pnpm --filter @erc7730/docs preview`.
