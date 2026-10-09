# Observability

`DecodeOptions.onEvent` is per call. It is not a process-wide listener. Pass a new function on each `clearSign`, `decodeTransaction`, or `decodeTypedData` call.

Events:

| Event | Payload |
| --- | --- |
| `decode:start` | `kind` (`transaction`, `typed-data`, `batch`, `user-op`) |
| `decode:end` | `kind`, `durationMs`, `source`, `confidence` |
| `registry:fetch` | `path`, `durationMs` |
| `registry:cache-hit` | `path` |
| `registry:miss` | `chainId`, `address` |
| `trust:accepted` / `trust:rejected` | `reasons` (stable trust-reason codes) |
| `warning:emitted` | `warningType` from `SECURITY_WARNING_TYPES` |

The official-registry client emits fetch and cache-hit only when the lookup passes the call's observer. Two decodes that share a registry do not mix counters. A cache hit on the second call does not emit `registry:fetch`.

```ts
import { clearSign } from '@erc7730/sdk';

const counts = { fetches: 0, hits: 0, accepted: 0, rejected: 0, warnings: 0 };
let latencyMs = 0;

await clearSign(tx, {
  onEvent(event) {
    if (event.type === 'registry:fetch') counts.fetches += 1;
    if (event.type === 'registry:cache-hit') counts.hits += 1;
    if (event.type === 'trust:accepted') counts.accepted += 1;
    if (event.type === 'trust:rejected') counts.rejected += 1;
    if (event.type === 'warning:emitted') counts.warnings += 1;
    if (event.type === 'decode:end') latencyMs = event.durationMs;
  },
});
```

Official-registry hit rate is `counts.accepted` over finished decodes. Cache hit rate is `counts.hits / (counts.hits + counts.fetches)` after the indexes are warm. `trust:rejected` with `POLICY_REJECTED` in `diagnostics` is a descriptor the policy refused, which is different from a registry miss.

Batch `clearSign` emits its own `decode:start` / `decode:end` with `kind: 'batch'`, and each call emits the transaction events too.
