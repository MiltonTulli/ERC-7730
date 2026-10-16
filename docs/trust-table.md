# Trust table

## Four separate signals

| Signal | Meaning | Limit |
| --- | --- | --- |
| `source` | Where the descriptor or fallback came from | Provenance is not a transaction-safety verdict. |
| `trust.accepted` | Whether the configured policy accepts that provenance or attestation | Acceptance does not prove the action is safe or every nested call is accepted. |
| `confidence` | Decode confidence, capped by untrusted fallbacks and expanded children | An accepted outer descriptor can still have low confidence. |
| `screens.verification` | Screen classification for the current operation | `verified` requires an accepted `official-registry` or `attested` source; it does not certify the whole execution tree. |

`screens.verification` is `rejected` when the policy refuses an `official-registry`, `attested`, or `local-override` source. All other cases are `unverified`, including an accepted local override or builtin. Warnings remain relevant at every verification level: a verified approval can still grant an unlimited allowance.

## Source × policy × confidence

| `source` | What it is | `officialOnlyPolicy` | `officialOrLocalPolicy` | `confidence` if accepted |
| --- | --- | --- | --- | --- |
| Official registry (commit SHA pin) or attestation | Curated ERC-7730 | `accepted: true` | `accepted: true` | Up to `"high"`; nested calls can lower it |
| Local `extend()` override | App-supplied | **`false`** | `true` | `"medium"` |
| Trusted-token template | Wallet `trustedTokens` map | **`false`** | policy-dependent | **never `"high"` under official-only** |
| Builtin ERC-20 / ERC-721 / WETH | Selector fallback. WETH only on its deployments | **`false`** | `true` | **`"medium"`**. Never `"high"` |
| Sourcify / `generateDescriptor` | ABI-generated fallback | **`false`** | **`false`** | **never `"high"`** |
| Inferred / basic selector decode | Guess from 4-byte + types | **`false`** | **`false`** | **`"low"`** |

When `trust` is omitted, the decode entry points and `clearSign` use `officialOnlyPolicy()`. Pass `officialOrLocalPolicy()` to deliberately accept an app `extend()` override or a builtin. These source policies accept the provenance supplied to them; they do not independently verify attestations. Use `attestedPolicy()` from `@erc7730/sdk/attest` to verify ERC-8176 attestations against configured attesters and EAS revocation state. It fails closed without the required options. The SDK never issues attestations. `composePolicies()` combines policies with `any` or `all`; an empty list rejects.

The playground defaults to Production (`officialOnlyPolicy()`, no Sourcify). Exploration opts into `officialOrLocalPolicy()` and Sourcify. See the [guide's policy recipes](./GUIDE.md#policy-recipes) for configuration.

## Safe outer call with an untrusted inner call

The [Ambire case study](./case-studies/ambire.md) records a Safe `execTransaction` CALL with an accepted official outer descriptor and an untrusted inner call. The outer operation has `source: "official-registry"`, `trust.accepted: true`, `confidence: "low"`, and `screens.verification: "verified"`. The inner operation retains its own source, rejection, and unverified screen.

Current runtime limitation: `attachChildren` lowers parent confidence and copies child warnings, but preserves the parent's source and trust report. `screenVerification` uses that parent source and acceptance; it does not aggregate child verification or inspect confidence. Consequently, an outer `verified` label is not evidence that every nested call is verified. Even the headline can incorporate a child's intent while retaining the outer classification. Render `screens.children` and risks, and inspect each decoded child's trust and confidence before making a wallet-level decision.

Automatic nested-call expansion supports recognized Multicall3 and Safe CALL wrappers and stops at depth two. Safe DELEGATECALL is not expanded. Embedded `format: "calldata"` results live in `field.embedded`; `toScreens` maps operation `children`, so a wallet must also inspect embedded results when presenting that data. Missing child screens do not establish full execution coverage. No simulation or transaction-safety guarantee follows from any of these signals.

This is the current behavior, not an aggregate verification guarantee. This documentation task leaves the runtime unchanged. The [design decisions](./design-decisions.md) explain the boundaries.

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

`source_official_registry_accepted` means the policy accepted an official-registry descriptor. `source_local_override_rejected` means it refused an `extend()` hit. `attested` means a trusted attester signed the descriptor hash. `attestation_options_incomplete` means `attestedPolicy` was called without attesters or an EAS `call`, or the configured EAS revocation call threw. `no_policies` means `composePolicies` was given an empty list.
