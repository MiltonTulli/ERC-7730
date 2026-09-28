---
title: What we are not
description: Not a catalog, not the reference TypeScript implementation, not ABI pretty-printing.
---

Say this out loud before integrating:

1. **Not a descriptor catalog.** The source of truth is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Open protocol metadata PRs there. `@erc7730/registry` in this monorepo is fixtures only.
2. **Not the reference TypeScript implementation.** That seat belongs to Sourcify clear-signing and the working group. This toolkit is pin-SHA + pluggable `TrustPolicy` + a JS authoring CLI, with documented interop against Ledger `python-erc7730`.
3. **Not ABI pretty-printing.** `generateDescriptor`, Sourcify ABI fallback, inferred selectors, and basic decoding are labeled by `source` and are **never** `confidence: "high"` under `officialOnlyPolicy()`.
4. **Not a second firmware converter.** Ledger `python-erc7730` owns authoring/firmware conversion the official registry CI runs. See [divergences](/ERC-7730/divergences/).
5. **The demo is not production policy.** The [playground](/ERC-7730/demo/) uses `officialOrLocalPolicy()` so local drafts are easy to try. Production guidance is `officialOnlyPolicy()` or `attestedPolicy()`.

## Related

- [Trust](/ERC-7730/trust/)
- [Interop](/ERC-7730/interop/)
- [Home](/ERC-7730/)
