---
"@erc7730/sdk": minor
---

ERC-20, ERC-721, and WETH builtins are the fallback when no registry descriptor matches. The source is `builtin`. `officialOnlyPolicy()` rejects it (`confidence: "low"`). `officialOrLocalPolicy()` accepts it at `medium`. It is never `high`. WETH matches only its own deployments. Pass `builtins: false` to skip them.
