# Migrating from 0.x to 1.0

Start from 0.12 if you use an earlier 0.x release. The [wallet guide](./GUIDE.md#11-migrating-to-010) covers the changes through 0.10; the [SDK changelog](../packages/sdk/CHANGELOG.md) records the 0.11 and 0.12 changes. This guide covers the remaining removals between 0.12 and the 1.0 API.

## Replace compatibility imports

`@erc7730/sdk/legacy` is removed. `/lite` and `/viem` were already removed in 0.10. Deep imports of internal helpers are unsupported. The supported entries are the root, `/attest`, `/generate`, `/sourcify`, and `/known-data`.

Use `decodeTransaction` and `decodeTypedData` instead of `format` and `formatTypedData`. Both retain the `officialOnlyPolicy()` default when `trust` is omitted. Pass `officialOrLocalPolicy()` explicitly to accept local overrides. Use `clearSign` when the caller needs confirmation screens and the default pinned official registry.

```ts
import { createClearSigner, decodeTransaction } from '@erc7730/sdk';

const tx = {
  to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  data: '0xd0e30db0',
  value: 10n ** 18n,
  chainId: 1,
} as const;

const operation = await decodeTransaction(tx, { provider: null });
const signer = createClearSigner({ provider: null });
const boundOperation = await signer.decodeTransaction(tx);
console.log(operation.intent, boundOperation.intent);
```

The returned signer retains `clearSign`, `decodeTransaction`, `decodeTypedData`, and `extend`. Its `decode` alias is removed. For its TypeScript type, use `ReturnType<typeof createClearSigner>`.

## Removed symbols

The table is generated from the API Extractor reports shipped at [`sdk-v0.12.0`](https://github.com/MiltonTulli/ERC-7730/tree/sdk-v0.12.0/api) (commit `0a2c047110374d049dcc1098bc4e1ced4ea1d883`), frozen under [`api/baselines/0.12.0`](../api/baselines/0.12.0), compared with the current [`api/`](../api) reports. It lists removed exports and removed deprecated methods. Replacement advice is maintained in the generator; unchanged exports are omitted.

Regenerate after building the SDK and updating its API reports:

```bash
pnpm --filter @erc7730/sdk build
pnpm --filter @erc7730/sdk api:report
node scripts/generate-migration-guide.mjs
```

CI runs the generator with `--check` and rejects undocumented removals or a stale table.

<!-- migration:start -->
| 0.12 import | Old symbol | 1.0 replacement |
| --- | --- | --- |
| `@erc7730/sdk/legacy` | `AddressNameParams` | Derive field params from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `COMMON_SIGNATURES` | No public replacement. Pass a per-call `DecodeOptions.signatures` map. |
| `@erc7730/sdk/legacy` | `ClearSigner` | `createClearSigner(options)` from `@erc7730/sdk`. |
| `@erc7730/sdk/legacy` | `ClearSigner.decode` | `createClearSigner(options).decodeTransaction(tx)`. |
| `@erc7730/sdk/legacy` | `ClearSignerConfig` | `DecodeOptions` from `@erc7730/sdk`. |
| `@erc7730/sdk/legacy` | `ContractContext` | Derive the contract binding from `InputDescriptor["context"]`. |
| `@erc7730/sdk/legacy` | `ContractDeployment` | `ResolvedDeployment` for resolved bindings; derive input deployments from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `DEFAULT_OFFICIAL_REGISTRY_BASE_URL` | Use the default of `createOfficialRegistry()` or set `OfficialRegistryConfig.baseUrl`. |
| `@erc7730/sdk/legacy` | `DateParams` | Derive field params from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `EIP1967_IMPLEMENTATION_SLOT` | No public replacement. `matchContext` handles proxy bindings with a `Provider`. |
| `@erc7730/sdk/legacy` | `ERC7730Context` | `NonNullable<InputDescriptor["context"]>`. |
| `@erc7730/sdk/legacy` | `ERC7730Descriptor` | `InputDescriptor` from `@erc7730/sdk`. |
| `@erc7730/sdk/legacy` | `ERC7730Display` | `NonNullable<InputDescriptor["display"]>`. |
| `@erc7730/sdk/legacy` | `ERC7730Metadata` | `NonNullable<InputDescriptor["metadata"]>`. |
| `@erc7730/sdk/legacy` | `ERC7730V2Descriptor` | `InputDescriptor` from `@erc7730/sdk`. |
| `@erc7730/sdk/legacy` | `EnumParams` | Derive field params from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `FieldDefinition` | Derive display fields from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `FieldFormatter` | Derive display fields from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `FormatParams` | Derive field params from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `FunctionFormat` | Derive format entries from `InputDescriptor["display"]`. |
| `@erc7730/sdk/legacy` | `NATIVE_CURRENCY` | No exported constant. Supply native-currency metadata through `ExternalDataProvider.resolveChainInfo`. |
| `@erc7730/sdk/legacy` | `OFFICIAL_REGISTRY_REPO` | No exported constant. The default registry is `ethereum/clear-signing-erc7730-registry`. |
| `@erc7730/sdk/legacy` | `Registry` | `createOfficialRegistry()` for pinned lookups, or `createClearSigner().extend(...)` for local overrides. |
| `@erc7730/sdk/legacy` | `RegistryFieldFormat` | `FieldFormat` for decoded results; derive descriptor formats from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `TokenAmountParams` | Derive field params from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `UnitParams` | Derive field params from `InputDescriptor`. |
| `@erc7730/sdk/legacy` | `ValidationError` | `ValidationIssue` from `@erc7730/sdk`. |
| `@erc7730/sdk/legacy` | `computeSelector` | No SDK replacement. Use your ABI library to compute selectors. |
| `@erc7730/sdk/legacy` | `createMemoryIncludeLoader` | Implement `IncludeLoader.load(ref, from)`; see the example below. |
| `@erc7730/sdk/legacy` | `decodeCalldata` | `decodeTransaction(tx, options)` for a decoded operation; use your ABI library for raw arguments. |
| `@erc7730/sdk/legacy` | `extractSelector` | No SDK replacement. Validate calldata, then take its first four bytes (`data.slice(0, 10)`). |
| `@erc7730/sdk/legacy` | `format` | `decodeTransaction(tx, options)` from `@erc7730/sdk`. |
| `@erc7730/sdk/legacy` | `formatAddress` | Render `DecodedField.value`, or format addresses in the wallet UI. |
| `@erc7730/sdk/legacy` | `formatAmount` | Render `DecodedField.value`; read structured amounts from `TokenAmountDetails`. |
| `@erc7730/sdk/legacy` | `formatTypedData` | `decodeTypedData(data, options)` from `@erc7730/sdk`. |
| `@erc7730/sdk/legacy` | `getDefaultClearSignRegistry` | `clearSign(input)` owns the default; use `createOfficialRegistry()` for an explicit registry. |
| `@erc7730/sdk/legacy` | `getSignatureBySelector` | No public replacement. Pass `DecodeOptions.signatures` or use your ABI library. |
| `@erc7730/sdk/legacy` | `getTokenInfo` | Supply `ExternalDataProvider.resolveToken`; curated metadata is opt-in via `knownDataProvider()` on `@erc7730/sdk/known-data`. |
| `@erc7730/sdk/legacy` | `isCommitSha` | No SDK replacement. Validate a full SHA with `/^[0-9a-f]{40}$/i`. |
| `@erc7730/sdk/legacy` | `isInfiniteApproval` | Inspect decoded warnings for `type === "infinite_approval"`. |
| `@erc7730/sdk/legacy` | `resolveAddress` | Render decoded fields; provide address lookup through `Provider.getEnsName` or `ExternalDataProvider.resolveLocalName`. |
| `@erc7730/sdk/legacy` | `resolveImplementation` | `matchContext` with a `Provider` for proxy-aware descriptor matching. |
| `@erc7730/sdk/legacy` | `toCaip10` | Construct `eip155:${chainId}:${address.toLowerCase()}`; type the result as `Caip10`. |
<!-- migration:end -->

## Supply an include loader

`resolveDescriptor` accepts an `IncludeLoader`. Replace `createMemoryIncludeLoader` with an implementation that loads documents from your own store. Use the `from` argument to resolve relative paths when needed; report missing documents by throwing.

```ts
import { type IncludeLoader, type InputDescriptor, resolveDescriptor } from '@erc7730/sdk';

const shared: InputDescriptor = {
  context: {
    contract: {
      deployments: [{ chainId: 1, address: '0x1111111111111111111111111111111111111111' }],
    },
  },
  metadata: { owner: 'Example' },
  display: { formats: {} },
};
const input: InputDescriptor = { includes: 'shared.json' };
const documents = new Map<string, InputDescriptor>([['shared.json', shared]]);
const loader: IncludeLoader = {
  async load(ref) {
    const document = documents.get(ref);
    if (!document) throw new Error(`Include not found: ${ref}`);
    return document;
  },
};

const resolved = await resolveDescriptor(input, loader);
console.log(resolved.hash);
```

`InputDescriptor` is the input model for both schema versions. Derive descriptor sections and field parameters from that schema type. Use `DecodedField`, `FieldFormat`, and `TokenAmountDetails` for decode results; legacy signature-index types do not describe those results.
