# Trust table

| `source` | What it is | `officialOnlyPolicy` | `officialOrLocalPolicy` | `confidence` if accepted |
| --- | --- | --- | --- | --- |
| Official registry (commit SHA pin) or attestation | Curated ERC-7730 | `accepted: true` | `accepted: true` | `"high"` |
| Local `extend()` override | App-supplied | **`false`** | `true` | `"medium"` |
| Trusted-token template | Wallet `trustedTokens` map | **`false`** | policy-dependent | **never `"high"` under official-only** |
| Builtin ERC-20 / ERC-721 / WETH | Selector fallback. WETH only on its deployments | **`false`** | `true` | **`"medium"`**. Never `"high"` |
| Sourcify / `generateDescriptor` | ABI-generated fallback | **`false`** | **`false`** | **never `"high"`** |
| Inferred / basic selector decode | Guess from 4-byte + types | **`false`** | **`false`** | **`"low"`** |

Clear signing is not ABI pretty-printing. Inject `officialOnlyPolicy()`, `attestedPolicy()`, `officialOrLocalPolicy()`, or `composePolicies()` so the wallet decides who to believe. When `trust` is omitted, `decode*` and `format*` use `officialOnlyPolicy()`. Pass `officialOrLocalPolicy()` to accept an app `extend()` override. The playground defaults to Production (`officialOnlyPolicy()`, no Sourcify). Exploration opts into `officialOrLocalPolicy()` and Sourcify.

## Reason codes

`TrustReport.reasons` is `TrustReasonCode[]`. Every code is snake_case. A source name keeps its meaning and replaces `-` with `_`.

| 0.11 | 0.12 |
| --- | --- |
| `source:official-registry:accepted` | `source_official_registry_accepted` |
| `source:official-registry:rejected` | `source_official_registry_rejected` |
| `source:attested:accepted` | `source_attested_accepted` |
| `source:attested:rejected` | `source_attested_rejected` |
| `source:local-override:accepted` | `source_local_override_accepted` |
| `source:local-override:rejected` | `source_local_override_rejected` |
| `source:trusted-token:accepted` | `source_trusted_token_accepted` |
| `source:trusted-token:rejected` | `source_trusted_token_rejected` |
| `source:builtin:accepted` | `source_builtin_accepted` |
| `source:builtin:rejected` | `source_builtin_rejected` |
| `source:sourcify:accepted` | `source_sourcify_accepted` |
| `source:sourcify:rejected` | `source_sourcify_rejected` |
| `source:generated:accepted` | `source_generated_accepted` |
| `source:generated:rejected` | `source_generated_rejected` |
| `source:inferred:accepted` | `source_inferred_accepted` |
| `source:inferred:rejected` | `source_inferred_rejected` |
| `source:basic:accepted` | `source_basic_accepted` |
| `source:basic:rejected` | `source_basic_rejected` |
| `untrusted_descriptor` | `untrusted_descriptor` |
| `no_policies` | `no_policies` |
| `ATTESTED` | `attested` |
| `NO_TRUSTED_ATTESTATION` | `no_trusted_attestation` |
| `ATTESTATION_OPTIONS_INCOMPLETE` | `attestation_options_incomplete` |

`no_trusted_attestation` is also `SecurityWarning.type`. The other warning types were already snake_case: `infinite_approval`, `dangerous_permissions`, `untrusted_descriptor`, `untrusted_spender`, `ownership_change`, `proxy_upgrade`, `expired_deadline`, `selector_mismatch`, `missing_metadata`, `interpolation_failed`.

`source_official_registry_accepted` means the policy accepted an official-registry descriptor. `source_local_override_rejected` means it refused an `extend()` hit. `attested` means a trusted attester signed the descriptor hash. `attestation_options_incomplete` means `attestedPolicy` was called without attesters or an EAS `call`. `no_policies` means `composePolicies` was given an empty list.
