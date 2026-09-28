---
title: Official registry
description: Pin ethereum/clear-signing-erc7730-registry by commit SHA. extend() is local-only.
---

Descriptors live in [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). This toolkit **consumes** that catalog. It does not accept descriptor PRs and does not ship a second catalog.

## Pin a commit SHA

```ts
import {
  createOfficialRegistry,
  fetchPrebuiltRegistryIndex,
  VENDORED_REGISTRY_COMMIT,
} from '@erc7730/sdk';

// Any 40-character commit SHA. Floating branch names (main / master) are rejected.
const pin = VENDORED_REGISTRY_COMMIT; // example only — choose your production pin

const indexes = await fetchPrebuiltRegistryIndex({ pin });
const registry = createOfficialRegistry({ pin, indexes });
```

`VENDORED_REGISTRY_COMMIT` is the SHA this repository vendors for schemas and fixtures. Production wallets pick and freeze their own pin.

Passing `indexes` means `index.calldata.json` and `index.eip712.json` are not fetched again. You can also bundle those JSON files at build time.

## Indexes

| Index | Lookup |
| --- | --- |
| `index.calldata.json` | CAIP-10 `eip155:{chainId}:{address}` (deployments and EIP-1967 / EIP-1167 implementations) |
| `index.eip712.json` | CAIP-10 of `context.eip712.deployments`, disambiguated with `encodeType` hash when needed |

There is **no** factory-clone catalog in the official indexes. Factory-only files match via `extend()` plus `matchContext` (deploy event logs), not by scanning the tree on a miss.

EIP-712 descriptors that bind only via `domain` / `domainSeparator` are not pre-indexed on GitHub. Load them through `extend()` (or a local overlay) and let `matchContext` run.

## `extend()` is local

```ts
registry.extend(myDescriptor); // local-override provenance — not an official-registry contribution
```

Local overrides are tagged `source: "local-override"`. Under `officialOnlyPolicy()` they are rejected. Under `officialOrLocalPolicy()` they can be accepted with medium confidence.

## Attestations

Optional `attachAttestations: true` loads ERC-8176 attestation JSON from the pinned tree (`registry/<project>/sigs/`). Pair with `attestedPolicy({ attesters, eas })`. The SDK verifies; it never issues attestations.

## What is not fetched

- `addressMatcher` URLs (v1-era) — fail closed
- Arbitrary GitHub `main` / `master` as a pin
- Etherscan / Sourcify as trusted clear-signing metadata

## See also

- [Trust model](/ERC-7730/trust/)
- [Wallet guide](/ERC-7730/guide/)
- [CLI registry update](/ERC-7730/cli/generate/#registry-update)
