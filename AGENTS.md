# ERC-7730

`@erc7730/sdk` and `@erc7730/cli` publish. `@erc7730/web`, `@erc7730/registry`, and `@erc7730/docs` do not.

## When you change code

Build `@erc7730/sdk`, then these four commands exit 0:

- `node scripts/check-nested-quantifiers.mjs`
- `node scripts/check-doc-snippets.mjs`
- `pnpm --filter @erc7730/sdk api:report`, then `git diff --exit-code -- api`
- `node scripts/check-sdk-bundles.mjs`

Changeset rules are in `CONTRIBUTING.md`. Release tooling is `RELEASE.md`.

## When you change docs

Canonical prose is `docs/GUIDE.md` and `docs/trust-table.md`. The quick start source is `docs/snippets/quickstart.ts`. A fenced `ts` sample that a reader can paste stands alone. A fence that uses an earlier binding has `<!-- snippet: continues -->` on the line above it.

## When you review

Apply `CODING_STANDARDS.md`. Reply to and resolve review threads with `gh api`, not the GitHub MCP.

## When you write on GitHub

Issue bodies, pull request bodies, and review replies are English. Comments stay on MiltonTulli/ERC-7730. The official registry repository is read-only from here.

## When the request lists tickets

Above three tickets, agree the slice before writing code. One pull request ships one slice of at most three.
