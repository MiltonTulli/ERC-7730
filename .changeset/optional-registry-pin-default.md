---
"@erc7730/sdk": minor
---

Make `createOfficialRegistry` pin optional. An omitted pin defaults to `VENDORED_REGISTRY_COMMIT` (a commit SHA), not `master`. Floating branches or tags require an explicit `ref` (for example `{ ref: "master" }`). A malformed `pin` still throws. Production wallets should keep passing an explicit SHA.
