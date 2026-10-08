# Wallet integration guide

How to wire `@erc7730/sdk` into a wallet as a clear-signing drop-in. Start with the quick start, then the production notes, then the rest.

## 1. Install

```bash
npm install @erc7730/sdk
```

`viem` is not installed with `@erc7730/sdk`. Import `attestedPolicy` from `@erc7730/sdk/attest` and add `viem` only when you use that entry. A viem `PublicClient` is still a valid `provider` if you already depend on viem. Importing `@erc7730/sdk` does not register an ABI loader.

What this toolkit is not: [not this](https://miltontulli.github.io/ERC-7730/not-this/).

## 2. Quick start

`createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT })` freezes the registry SHA shipped with the SDK. `officialOnlyPolicy()` is also what you get when `trust` is omitted. The snippet is [`docs/snippets/quickstart.ts`](./snippets/quickstart.ts).

<!-- quickstart:start -->
```ts
import {
  VENDORED_REGISTRY_COMMIT,
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT });

const result = await decodeTransaction(
  {
    to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    data: '0xd0e30db0',
    value: 10n ** 18n,
    chainId: 1,
  },
  { registry, trust: officialOnlyPolicy() }
);

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.fields);
console.log(result.source, result.confidence, result.trust.accepted);
```
<!-- quickstart:end -->

Expected output for this WETH `deposit()`: `Wrap`, an Amount field of `1 ETH`, then `official-registry high true`.

## 3. Production

The snippet above is the production call.

- Pass an explicit `pin`. The omitted pin is the vendored SHA; name it at the call site.
- `officialOnlyPolicy()` accepts `official-registry` and `attested` only. Sourcify, generated drafts, inferred selectors, basic decoding, and builtins stay `confidence: "low"`.
- With no network, pass `indexes` and `cache`. See [Prefetch](#4-prefetch-the-official-indexes).
- ERC-20, ERC-721, and WETH builtins run when the registry has no match (`builtins` defaults to `true`). Official-only rejects that source.
- ERC-8176: import `attestedPolicy` from `@erc7730/sdk/attest`. See [Attestations](#8-attestations).

Full source × policy × confidence table: [`trust-table.md`](./trust-table.md) (also [/trust](https://miltontulli.github.io/ERC-7730/trust/) on the docs site).

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

Passing `indexes` means those two files are not fetched again. You can also bundle the JSON at build time. With no network, pass `indexes` and a `cache`. Without a registry, the SDK falls back to ABI inference at `confidence: 'low'`.

## 5. Local overrides with `extend()`

App-local descriptors sit on top of the pinned registry. `extend()` mutates the registry and returns `void` — do not chain it onto the constructor result.

```ts
import {
  createOfficialRegistry,
  officialOrLocalPolicy,
  VENDORED_REGISTRY_COMMIT,
  type InputDescriptor,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT });

const localDescriptors: InputDescriptor[] = [
  // Your validated app-local descriptors.
];
registry.extend(localDescriptors);

// Under officialOnlyPolicy(), local overrides are never confidence high.
// When you intentionally accept them:
const trust = officialOrLocalPolicy();
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
| `format` / `formatTypedData` | Deprecated aliases of `decode*`. Omitted `trust` is `officialOnlyPolicy()` |

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

Import `attestedPolicy` from `@erc7730/sdk/attest`. The other policies come from `@erc7730/sdk`.

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
import { attestedPolicy } from '@erc7730/sdk/attest';

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

Importing `@erc7730/sdk` does not contact Sourcify and does not install a default ABI loader. `fetchFromSourcify` stays exported for apps that want the client.

Opt in per call. `useSourcifyFallback: true` does nothing until that call passes a loader. There is no process-wide loader.

```ts
import { decodeTransaction, sourcifyVerifiedAbiLoader } from '@erc7730/sdk';

await decodeTransaction(tx, {
  useSourcifyFallback: true,
  loadVerifiedAbi: sourcifyVerifiedAbiLoader,
});
```

Call-scoped signatures override the built-in selector table for that decode only. Pass them on `DecodeOptions` or `createClearSigner`. There is no process-wide signature map.

```ts
await decodeTransaction(tx, {
  signatures: { '0xa9059cbb': 'send(address payee,uint256 coins)' },
});
```

Result `source` is `"sourcify"` and confidence is never high. That path verifies an ABI; it is not clear-signing metadata.

## 11. Migrating to 0.10

- Omitted `trust` is `officialOnlyPolicy()`. The `unspecified` policy id is gone.
- Public field and warning types are `DecodedField`, `SecurityWarning`, and `FieldFormat` from `@erc7730/sdk`. The old `ERC7730*` aliases are not exported from the package root.
- `@erc7730/sdk/lite` and `@erc7730/sdk/viem` are removed. `decodeViemTransaction` is removed; call `decodeTransaction`. `decodeViemTypedData` is exported from `@erc7730/sdk`.
- `attestedPolicy` is imported from `@erc7730/sdk/attest`. That entry can depend on `viem`. The root entry does not.
- ERC-20, ERC-721, and WETH builtins run when no registry descriptor matches (`DecodeOptions.builtins`, default `true`). `officialOnlyPolicy()` rejects them, so confidence stays `low`.
- `viem` is not a dependency of the root. Keccak is `@noble/hashes`. The ABI codec is `ox`.
- Published `@erc7730/sdk` and `@erc7730/cli` require Node.js 20 or newer. Building this repository still needs Node.js 22.18 or newer.
- Malformed input throws `InvalidInputError` (`INVALID_ADDRESS`, `INVALID_HEX`, `INVALID_CHAIN_ID`, `INVALID_CALLDATA`, `INVALID_TYPED_DATA`).
- There is no process-global signature table or Sourcify loader. Pass `signatures` and `loadVerifiedAbi` on the call.

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
