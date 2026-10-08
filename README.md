# ERC-7730

TypeScript tooling for [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear signing.

[![npm sdk](https://img.shields.io/npm/v/@erc7730/sdk.svg?label=%40erc7730%2Fsdk)](https://www.npmjs.com/package/@erc7730/sdk)
[![npm cli](https://img.shields.io/npm/v/@erc7730/cli.svg?label=%40erc7730%2Fcli)](https://www.npmjs.com/package/@erc7730/cli)
[![ERC-7730](https://img.shields.io/badge/schema-v1%20%2B%20v2-3b82f6)](https://eips.ethereum.org/EIPS/eip-7730)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Docs:** [miltontulli.github.io/ERC-7730](https://miltontulli.github.io/ERC-7730/) · **Playground:** […/demo](https://miltontulli.github.io/ERC-7730/demo/)

This repository is a small toolkit. It is **not** the descriptor catalog and **not** the reference TypeScript implementation. The source of truth is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). New protocol metadata belongs there, not in this repo. The published `@erc7730/sdk` tarball does not include a catalog. Lookup is `createOfficialRegistry()` (defaults to the vendored commit SHA) or `createOfficialRegistry({ pin })`. With no network, pass `indexes` and `cache`. Without a registry, the SDK falls back to ABI inference at `confidence: 'low'`.

## Packages

| Package | Role | npm |
| --- | --- | --- |
| [`@erc7730/sdk`](./packages/sdk/README.md) | Runtime: validate, pin the official registry, resolve, decode with `TrustPolicy` | [published](https://www.npmjs.com/package/@erc7730/sdk) |
| [`@erc7730/cli`](./packages/cli/README.md) | Authoring CLI (`erc7730` binary only) | [published](https://www.npmjs.com/package/@erc7730/cli) |
| `@erc7730/registry` | Historical snapshot / fixtures. Not a contribution target | private |
| `@erc7730/web` | Browser playground (mounted at `/demo` on Pages) | private |
| `@erc7730/docs` | Starlight docs site deployed to GitHub Pages | private |

`@erc7730/sdk` and `@erc7730/cli` are versioned and released independently (`sdk-v*` / `cli-v*` tags). See [RELEASE.md](./RELEASE.md). Product direction: [ROADMAP.md](./ROADMAP.md). Authoring imports: [CONTRIBUTING.md](./CONTRIBUTING.md).

## Install

```bash
npm install @erc7730/sdk
npm install -D @erc7730/cli
```

`viem` is included with `@erc7730/sdk`.

## Quick start

### 1. Smallest call (intent + fields)

`createOfficialRegistry()` uses the vendored commit SHA. No policy lecture yet — paste this and print an intent:

```typescript
import { createOfficialRegistry, decodeTransaction } from '@erc7730/sdk';

const registry = createOfficialRegistry();

const result = await decodeTransaction(
  {
    to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    data: '0xd0e30db0',
    value: 10n ** 18n,
    chainId: 1,
  },
  { registry }
);

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.fields);
```

Illustrative summary: Wrap · 1 ETH · official-registry · high · accepted: true

### 2. Production (explicit pin + trust)

Same call with a frozen SHA and `officialOnlyPolicy()`. That policy rejects Sourcify / `generateDescriptor` / inferred / basic as high confidence:

```typescript
import {
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
  VENDORED_REGISTRY_COMMIT,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT });

const tx = {
  to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  data: '0xd0e30db0',
  value: 10n ** 18n,
  chainId: 1,
} as const;

const result = await decodeTransaction(tx, {
  registry,
  trust: officialOnlyPolicy(),
});

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.source, result.confidence, result.trust.accepted);
```

Clear signing is not ABI pretty-printing. Prefetch, `extend()`, `ExternalDataProvider` (token / ENS / NFT — the SDK does no RPC), batch, UserOp, and attestations: [`docs/GUIDE.md`](./docs/GUIDE.md) or the [site guide](https://miltontulli.github.io/ERC-7730/guide/). Trust table: [site /trust](https://miltontulli.github.io/ERC-7730/trust/).

## CLI

```bash
erc7730 generate --chain-id 1 --address 0x... --abi ./abi.json --owner "My Protocol"
erc7730 lint ./calldata.json
erc7730 preview --data 0x... --to 0x... --chain-id 1 --pin <sha>
erc7730 scaffold --chain-id 1 --address 0x... --abi ./abi.json --owner "My Protocol" --out ./draft
```

Walkthrough and flag reference: [CLI docs](https://miltontulli.github.io/ERC-7730/cli/). The CLI does not open PRs against the official registry.

## Schema compatibility

| Package line | ERC-7730 schema |
| --- | --- |
| SDK 0.x | Decodes v1 and v2 descriptors; `validateDescriptor` accepts v1 and v2 |
| CLI 0.x | Lints v1 and v2. `generate` writes a v2 draft |

## Project structure

```
ERC-7730/
├── packages/
│   ├── sdk/       # @erc7730/sdk
│   ├── cli/       # @erc7730/cli
│   ├── docs/      # GitHub Pages site
│   ├── web/       # playground → /demo
│   └── registry/  # fixtures
├── docs/          # GUIDE, interop, divergences, github-action (included by the site)
├── RELEASE.md
└── ROADMAP.md
```

## Related

- [EIP-7730](https://eips.ethereum.org/EIPS/eip-7730) · [clearsigning.org](https://clearsigning.org)
- Official registry · Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) · Sourcify clear-signing
- Interop notes: [`docs/interop.md`](./docs/interop.md) · Divergences: [`docs/divergences.md`](./docs/divergences.md)
- Security reports: [`SECURITY.md`](./SECURITY.md)

## License

[MIT](./LICENSE)
