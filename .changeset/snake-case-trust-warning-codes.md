---
"@erc7730/sdk": minor
---

Trust reason codes and the `no_trusted_attestation` warning are snake_case. `TrustReport.reasons` is `TrustReasonCode[]`.

| Before | After |
| --- | --- |
| `source:official-registry:accepted` | `source_official_registry_accepted` |
| `source:<source>:rejected` | `source_<source>_rejected` (`official_registry`, `local_override`, `trusted_token`, and the other sources) |
| `ATTESTED` | `attested` |
| `NO_TRUSTED_ATTESTATION` | `no_trusted_attestation` (reason and `SecurityWarning.type`) |
| `ATTESTATION_OPTIONS_INCOMPLETE` | `attestation_options_incomplete` |

`untrusted_descriptor` and `no_policies` are unchanged. The other `SECURITY_WARNING_TYPES` were already snake_case.
