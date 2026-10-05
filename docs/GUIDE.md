# Wallet integration guide

How to wire `@erc7730/sdk` into a wallet as a clear-signing drop-in. Structure matches the Sourcify TS guide: smallest call first, then the production path, then the rest.

## 1. Install

```bash
npm install @erc7730/sdk
# optional peer for adapters / public clients
npm install viem
```

The published package does not include a descriptor catalog. `@erc7730/sdk/lite` is a deprecated narrower entry (it omits the Sourcify client and `generateDescriptor` from that graph). It is not a separate install and it is not how descriptors are loaded. Importing `@erc7730/sdk` does not register an ABI loader.

## 2. Smallest call (intent + fields)

`createOfficialRegistry()` with no pin uses `VENDORED_REGISTRY_COMMIT` (a commit SHA shipped with the SDK). Paste this, print an intent, then harden:

```ts
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

## 3. Production (explicit pin + trust)

Same call with a frozen SHA and `officialOnlyPolicy()`. That policy rejects Sourcify / `generateDescriptor` / inferred / basic as high confidence. Clear signing is not ABI pretty-printing.

```ts
import {
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
  VENDORED_REGISTRY_COMMIT,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT });

const result = await decodeTransaction(tx, {
  registry,
  trust: officialOnlyPolicy(),
});

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.source, result.confidence, result.trust.accepted);
```

Full source × policy × confidence table: [`trust-table.md`](./trust-table.md) (also [/trust](https://miltontulli.github.io/ERC-7730/trust/) on the docs site). Or require ERC-8176 attestations — see [Attestations](#8-attestations) below.

## 4. Prefetch the official indexes

Descriptors live in [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Fetch the indexes once at app boot and keep the object yourself:

```ts
import {
  createOfficialRegistry,
  fetchPrebuiltRegistryIndex,
  VENDORED_REGISTRY_COMMIT,
} from '@erc7730/sdk';

const pin = VENDORED_REGISTRY_COMMIT;
const indexes = await fetchPrebuiltRegistryIndex({ pin });
const registry = createOfficialRegistry({ pin, indexes });
```

Passing `indexes` means those two files are not fetched again. You can also bundle the JSON at build time. With no network, pass `indexes` and a `cache`. ERC-20, ERC-721, and WETH builtins (`ERC20_DESCRIPTOR`, `ERC721_DESCRIPTOR`, `WETH_DESCRIPTOR`) stay local fallbacks. They are not a catalog.

## 5. Local overrides with `extend()`

App-local descriptors sit on top of the pinned registry. Under `officialOnlyPolicy()` they are never `confidence: "high"`; use `officialOrLocalPolicy()` when you intentionally accept them:

```ts
const registry = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT }).extend([
  myLocalDescriptor,
]);
```

## 6. External data provider

The decode core does **no** RPC, ENS, or token-list I/O of its own. Inject an `ExternalDataProvider` when you want resolved token amounts, ENS / local names, or NFT collection labels:

```ts
const externalDataProvider = {
  resolveToken: async (chainId, address) => ({
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  }),
  resolveEnsName: async (address) => 'alice.eth',
  resolveLocalName: async (address) => 'Alice',
  resolveNftCollectionName: async (chainId, address) => 'Bored Ape Yacht Club',
  resolveBlockTimestamp: async (chainId, blockHeight) => 1_715_000_000,
  resolveChainInfo: async (chainId) => ({
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    decimals: 18,
  }),
  // Same hook attestedPolicy uses for EAS revocation.
  chainClient: {
    call: async (chainId, { to, data }) => rpcEthCall(chainId, to, data),
  },
};
```

| Hook | Use |
|---|---|
| `resolveToken` | ERC-20 decimals / symbol for `tokenAmount` |
| `resolveEnsName` / `resolveLocalName` | Human names for `addressName` |
| `resolveNftCollectionName` | Collection label for NFT formats |
| `resolveBlockTimestamp` / `resolveChainInfo` | Date and chain metadata |
| `chainClient.call` | eth_call for EAS revocation under `attestedPolicy` |

Omit a method to fall back to raw formatting / local catalogs. Do not treat `KNOWN_TOKENS` or Sourcify ABI as trusted clear-signing metadata.

## 7. Decode calls (batch / UserOp)

```ts
import {
  decodeTransaction,
  decodeTypedData,
  decodeBatch,
  decodeUserOp,
  format,
  composePolicies,
  officialOnlyPolicy,
  officialOrLocalPolicy,
  attestedPolicy,
} from '@erc7730/sdk';

const opts = {
  registry,
  trust: officialOnlyPolicy(),
  externalDataProvider,
  trustedTokens,
  useSourcifyFallback: false, // default; ABI fallback is opt-in
  // Optional: known routers / operators suppress `untrusted_spender`
  // spenderAllowlist: [router],
};

const txDisplay = await decodeTransaction(tx, opts);
const typedDisplay = await decodeTypedData(typedData, opts);
const batchDisplay = await decodeBatch(
  { chainId: 1, from: user, calls: [{ to, data }, { to, data }] },
  opts
);
const userOpDisplay = await decodeUserOp(
  { chainId: 1, sender: account, callData },
  opts
);
```

| Function | When |
|---|---|
| `decodeTransaction` | `eth_sendTransaction` / `eth_signTransaction` (Multicall3 / Safe CALL → `children`) |
| `decodeTypedData` | `eth_signTypedData` |
| `decodeBatch` | EIP-5792 `wallet_sendCalls` |
| `decodeUserOp` | ERC-4337 Simple Account `execute` / `executeBatch` |
| `format` / `formatTypedData` | Compat aliases of `decode*` (+ default `officialOrLocalPolicy` when a registry is set) |

Batch / nested `interpolatedIntent` joins per-call sentences with `" and "`.

### Trusted token templates

The registry cannot hold every ERC-20 / ERC-721. List tokens your wallet already trusts; on a miss the SDK renders from bundled templates. Under `officialOnlyPolicy()` this path is never `confidence: "high"`.

```ts
const trustedTokens = {
  1: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'erc20',
    '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d': 'erc721',
  },
} as const;
```

A registry descriptor for the same address always wins over the template.

### Policy recipes

| Recipe | Code |
|---|---|
| Pin only | `trust: officialOnlyPolicy()` |
| Pin + local `extend()` | `trust: officialOrLocalPolicy()` |
| ERC-8176 attesters | `trust: attestedPolicy({ attesters, eas })` |
| Pin **or** attested | `trust: composePolicies([officialOnlyPolicy(), attestedPolicy(...)], 'any')` |
| Pin **and** attested | `composePolicies([officialOnlyPolicy(), attestedPolicy(...)], 'all')` |

`trust.reasons` are stable codes (`source:official-registry:accepted`, `ATTESTED`, …) — safe for telemetry / i18n. Prefer them over free-form sentences.

## 8. Attestations

```ts
import { attestedPolicy } from '@erc7730/sdk';

const trustAttested = attestedPolicy({
  attesters: ['0x3846c3A30E62075Fa916216b35EF04B8F53931f6'],
  eas: {
    // Required. eth_call to the EAS contract on Ethereum mainnet for revokeOffchain.
    call: async (chainId, { to, data }) => rpcEthCall(chainId, to, data),
  },
});
```

Without `eas.call`, `attestedPolicy` fails closed (`ATTESTATION_OPTIONS_INCOMPLETE` / `NO_TRUSTED_ATTESTATION`). The SDK never issues attestations.

Load attestation JSON with `createOfficialRegistry({ pin, attachAttestations: true })`, or set `ResolvedDescriptor.attestations` yourself in tests.

## 9. What to show

- Prefer `interpolatedIntent` when present (spec option 1). Fields may still be shown.
- Otherwise show `intent` + `fields`.
- Surface `warnings` (e.g. `NO_TRUSTED_ATTESTATION`, `interpolation_failed`, `infinite_approval`).
- Nested `format: "calldata"` fields expose `field.embedded`. Multicall3 / Safe CALL / UserOp expose `children: DecodedOperation[]` with per-child `source` and `trust`.
- `locale` only formats numbers and dates. Descriptor intent strings are never translated.

## 10. Sourcify ABI fallback

Importing `@erc7730/sdk`, `@erc7730/sdk/lite`, or `@erc7730/sdk/viem` does not contact Sourcify and does not install a default ABI loader. `fetchFromSourcify` stays exported for apps that want the client.

Opt in per call. `useSourcifyFallback: true` still does nothing until a loader is set:

```ts
import {
  decodeTransaction,
  enableSourcifyAbiLoader,
  sourcifyVerifiedAbiLoader,
} from '@erc7730/sdk';

// Process-wide default. Inert until useSourcifyFallback is true.
enableSourcifyAbiLoader();
await decodeTransaction(tx, { useSourcifyFallback: true });

// Or pass the loader on this call only.
await decodeTransaction(tx, {
  useSourcifyFallback: true,
  loadVerifiedAbi: sourcifyVerifiedAbiLoader,
});
```

Result `source` is `"sourcify"` and confidence is never high. That path verifies an ABI; it is not clear-signing metadata. `@erc7730/sdk/lite` does not import the Sourcify client. That entry is not the descriptor lookup.

## See also

- Docs site — https://miltontulli.github.io/ERC-7730/
- [trust-table.md](./trust-table.md) — source × policy × confidence
- Root [README.md](../README.md) — install + short start
- [interop.md](./interop.md) — vs python-erc7730 / Sourcify TS
- [github-action.md](./github-action.md) — protocol ABI-vs-descriptor CI snippet
- [ROADMAP.md](../ROADMAP.md) — shipped scope
- Official registry — https://github.com/ethereum/clear-signing-erc7730-registry
- ERC-7730 — https://eips.ethereum.org/EIPS/eip-7730
- ERC-8176 — https://github.com/ethereum/ERCs/pull/1576
