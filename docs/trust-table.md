# Trust table

| `source` | What it is | `officialOnlyPolicy` | `officialOrLocalPolicy` | `confidence` if accepted |
| --- | --- | --- | --- | --- |
| Official registry (commit SHA pin) or attestation | Curated ERC-7730 | `accepted: true` | `accepted: true` | `"high"` |
| Local `extend()` override | App-supplied | **`false`** | `true` | `"medium"` |
| Trusted-token template | Wallet `trustedTokens` map | **`false`** | policy-dependent | **never `"high"` under official-only** |
| Builtin ERC-20 / ERC-721 / WETH | Selector fallback. WETH only on its deployments | **`false`** | `true` | **`"medium"`**. Never `"high"` |
| Sourcify / `generateDescriptor` | ABI-generated fallback | **`false`** | **`false`** | **never `"high"`** |
| Inferred / basic selector decode | Guess from 4-byte + types | **`false`** | **`false`** | **`"low"`** |

Clear signing is not ABI pretty-printing. Inject `officialOnlyPolicy()`, `attestedPolicy()`, `officialOrLocalPolicy()`, or `composePolicies()` so the wallet decides who to believe. When `trust` is omitted, `decode*` and `format*` use `officialOnlyPolicy()`. Pass `officialOrLocalPolicy()` to accept an app `extend()` override. The playground still defaults to `officialOrLocalPolicy()` so local drafts are easy to try.
