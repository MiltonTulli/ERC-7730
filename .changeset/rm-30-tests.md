---
"@erc7730/sdk": patch
---

The ERC-7730 path grammar prints back to the path it parsed. Descriptor hashes stay the same when object keys are reordered or an address changes case. Merging an include twice returns the same document. The Node unit-test setup blocks calls to globalThis.fetch unless ERC7730_LIVE=1. The pinned registry lookup runs only when ERC7730_LIVE=1, and a failed lookup fails the run.
