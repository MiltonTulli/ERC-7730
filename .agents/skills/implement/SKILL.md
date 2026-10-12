---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work in the spec or tickets.

## Slice

Count the tickets in the request. Above three, name a slice of at most three and wait for the user to pick it. One pull request ships one slice. The slice is settled when the user confirms it, or when the request already lists three tickets or fewer.

## Build

Fetch each ticket and state its title before editing. An ambiguous reference waits for an answer.

Read the `tdd` skill and follow it at each seam the ticket names.

Run `pnpm typecheck` and the single test file for the seam while the code is moving. Run `pnpm test` once, after the slice is complete.

## Gate

The slice is ready to commit when every command below exits 0. Build the SDK first (`pnpm --filter @erc7730/sdk build`). The snippet check and the bundle check read `packages/sdk/dist`.

- `node scripts/check-nested-quantifiers.mjs`
- `node scripts/check-doc-snippets.mjs`
- `pnpm --filter @erc7730/sdk api:report`, then `git diff --exit-code -- api`
- `node scripts/check-sdk-bundles.mjs`

## Review

Read the `review` skill and run it on this branch before committing. Paste `CODING_STANDARDS.md` into the reviewer prompt. Every rule in that file is in scope.

Commit the slice to the current branch.
