---
"@erc7730/sdk": minor
---

Breaking (0.3): primary decode API is `decodeTransaction` / `decodeTypedData` plus `createClearSigner(options?)`. `ClearSigner.decode` is a deprecated alias of `decodeTransaction` and now returns `DecodedOperation`.

```ts
// before
const signer = new ClearSigner();
const result = await signer.decode(tx); // DecodedTransaction (v1)

// after
import {
  createClearSigner,
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({ pin: '<commit sha>' });
const result = await decodeTransaction(tx, {
  registry,
  trust: officialOnlyPolicy(),
});

// or bind options
const signer = createClearSigner({ registry, trust: officialOnlyPolicy() });
await signer.decodeTransaction(tx);
await signer.decodeTypedData(typedData);
// signer.decode(tx) still works for one minor
```
