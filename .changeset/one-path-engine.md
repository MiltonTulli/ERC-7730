---
"@erc7730/sdk": minor
---

The decoder resolves field paths with the strict path engine. `decode/path.ts` is gone, so there is one `resolvePath` and one `PathResolveError`. Missing fields stay empty via `tryResolvePath`. Invalid paths throw.
