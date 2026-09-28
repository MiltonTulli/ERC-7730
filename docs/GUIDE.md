# Wallet integration guide

How to wire `@erc7730/sdk` into a wallet as a clear-signing drop-in. Structure matches the Sourcify TS guide; the defaults here keep **pin + policy** explicit.

## 1. Install

```bash
npm install @erc7730/sdk
# optional peer for adapters / public clients
npm install viem
```

Use `@erc7730/sdk/lite` when you want the decode surface without the full package’s Sourcify client registration.

## 2. Prefetch the official indexes

Descriptors live in [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). Pin a **commit SHA**. Fetch the indexes once at app boot and keep the object yourself:

```ts
import {
  createOfficialRegistry,
  fetchPrebuiltRegistryIndex,
} from '@erc7730/sdk';

const pin = '9f37816afde954ff6617fb5baa346133e5af26c5';
const indexes = await fetchPrebuiltRegistryIndex({ pin });

const registry = createOfficialRegistry({ pin, indexes });
```

Passing `indexes` means those two files are not fetched again. You can also bundle the JSON at build time.

## 3. Production trust policy

Do not show unreviewed registry metadata as high confidence in production.

```ts
import { officialOnlyPolicy, attestedPolicy } from '@erc7730/sdk';

// Pin-only: accept official-registry / attested provenance.
const trust = officialOnlyPolicy();

// Or require ERC-8176 attestations from auditors you trust
// (files under registry/<project>/sigs/ in the official registry).
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

## 4. Trusted token templates

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

## 5. External data provider

The decode core does not open RPC, ENS, or token lists by itself when you inject a provider:

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

Omit a method to fall back to raw formatting / local catalogs. Do not treat `KNOWN_TOKENS` or Sourcify ABI as trusted clear-signing metadata.

## 6. Decode calls

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

### Policy recipes

| Recipe | Code |
|---|---|
| Pin only | `trust: officialOnlyPolicy()` |
| Pin + local `extend()` | `trust: officialOrLocalPolicy()` |
| ERC-8176 attesters | `trust: attestedPolicy({ attesters, eas })` |
| Pin **or** attested | `trust: composePolicies([officialOnlyPolicy(), attestedPolicy(...)], 'any')` |
| Pin **and** attested | `composePolicies([officialOnlyPolicy(), attestedPolicy(...)], 'all')` |

`trust.reasons` are stable codes (`source:official-registry:accepted`, `ATTESTED`, …) — safe for telemetry / i18n. Prefer them over free-form sentences.

## 7. What to show

- Prefer `interpolatedIntent` when present (spec option 1). Fields may still be shown.
- Otherwise show `intent` + `fields`.
- Surface `warnings` (e.g. `NO_TRUSTED_ATTESTATION`, `interpolation_failed`, `infinite_approval`).
- Nested `format: "calldata"` fields expose `field.embedded`. Multicall3 / Safe CALL / UserOp expose `children: DecodedOperation[]` with per-child `source` and `trust`.
- `locale` only formats numbers and dates. Descriptor intent strings are never translated.

## 8. Sourcify ABI fallback

Opt in with `useSourcifyFallback: true` on the full `@erc7730/sdk` entry. Result `source` is `"sourcify"` and confidence is never high. That path verifies an ABI; it is not clear-signing metadata. `@erc7730/sdk/lite` does not register the Sourcify client.

## See also

- Root [README.md](../README.md) — API overview and trust table
- [interop.md](./interop.md) — vs python-erc7730 / Sourcify TS
- [github-action.md](./github-action.md) — protocol ABI-vs-descriptor CI snippet
- [ROADMAP.md](../ROADMAP.md) — v0.5 / v0.6 scope
- Official registry — https://github.com/ethereum/clear-signing-erc7730-registry
- ERC-7730 — https://eips.ethereum.org/EIPS/eip-7730
- ERC-8176 — https://github.com/ethereum/ERCs/pull/1576
