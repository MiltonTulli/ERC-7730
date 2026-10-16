# Design decisions

`@erc7730/sdk` turns transactions and typed data into human-readable operations and confirmation screens using ERC-7730 descriptors. These decisions define what a wallet can rely on when adopting it.

## Commit-SHA registry pins

The descriptor source of truth is [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). This repository consumes it; `@erc7730/registry` is a private fixture snapshot, not a descriptor catalog or contribution target.

`createOfficialRegistry` requires a 40-character commit SHA when a pin is supplied. Mutable branch names such as `main` and `master` are rejected. Omitting the pin uses `VENDORED_REGISTRY_COMMIT`, the SHA shipped with that SDK version. The default can change when the SDK is upgraded; an explicit pin makes descriptor updates a separate wallet decision.

A pin fixes registry contents for reproducible lookups and review. It does not prove that metadata is correct, make the registry available offline, or freeze external enrichment. Reproducing a screen also requires the same SDK, input, policy, provider data, and formatting options.

To update a production pin:

1. Choose a reviewed registry commit and inspect the descriptor/index changes since the current pin.
2. Test representative wallet transactions, nested calls, warnings, and screens against that exact SHA.
3. Update the explicit `pin` and refresh the matching prefetched indexes and descriptor cache together. Keep offline assets associated with their SHA.
4. Deploy the pin as a reviewed application change. Keep the previous pin and matching assets available for rollback.

For API examples and offline setup, see the [wallet guide](./GUIDE.md#4-prefetch-the-official-indexes) and [registry page](https://miltontulli.github.io/ERC-7730/registry/).

## Trust acceptance is a metadata decision

Omitted `trust` uses `officialOnlyPolicy()`. It accepts `official-registry` and `attested` provenance, and rejects local overrides and fallbacks. The policy evaluates the provenance supplied by the registry/resolver; it is not an independent audit of that metadata. Applications supplying their own registry are responsible for its provenance claims.

An accepted descriptor explains how a call is displayed. It does not establish that the transaction is safe, the recipient is honest, the amount is appropriate, or execution will have the intended effect. Attestation verification is an explicit policy choice through `attestedPolicy` from `@erc7730/sdk/attest`; accepting the `attested` source alone does not perform that verification. See the [trust model](./trust-table.md) for policies and reason codes.

`officialOrLocalPolicy()` lets a wallet deliberately accept its local descriptors and builtins. That changes acceptance, not provenance: an `extend()` result remains `local-override` and its screen remains `unverified` even when accepted.

## ABI fallbacks retain their provenance

Sourcify can supply a verified ABI, and `generateDescriptor` can author a draft from an ABI. Neither process establishes reviewed intent text, complete display coverage, or trusted registry membership. A builtin template recognizes a known interface or selector; that recognition does not authenticate the target contract's behavior.

Those results keep their own `source`. Under the default policy they are rejected and remain low confidence. Accepting a builtin under `officialOrLocalPolicy()` yields medium confidence, with an `unverified` screen. Curated names from `@erc7730/sdk/known-data` are enrichment, not trusted descriptor provenance. Sourcify is an opt-in loader from a separate entry; importing the root does not install it.

## Source, acceptance, confidence, and verification are separate

Read all four signals: `source` records provenance, `trust.accepted` records the policy decision, `confidence` describes the decode, and `screens.verification` classifies the current operation's screen. The [canonical trust model](./trust-table.md#four-separate-signals) defines their relationship.

In the documented Safe `execTransaction` CALL example, the official outer descriptor is accepted and the outer screen stays `verified`, while the untrusted inner call lowers parent confidence to `low`. The outer label does not certify the inner call. Render child screens and warnings and assess each child separately. Safe DELEGATECALL is not expanded, and automatic nested-call expansion stops at depth two; an absent child is not proof that all execution was inspected. See the [Safe example and current runtime limitations](./trust-table.md#safe-outer-call-with-an-untrusted-inner-call).

## The decode core does no RPC

The wallet owns RPC endpoints, privacy choices, caching, timeouts, and chain state. Inject contract-state/context hooks and an `ExternalDataProvider` for token decimals, names, ENS, collection labels, timestamps, and chain metadata. Attestation revocation checks use the caller's `eas.call`. Enrichment belongs in those application-controlled adapters, where failures and data freshness can be handled explicitly.

No RPC in the core does not mean no network anywhere: the official registry client fetches pinned files unless supplied with the needed indexes/cache, and an enabled Sourcify loader performs HTTP requests. The [guide](./GUIDE.md#6-external-data-provider) explains provider fallbacks. This SDK does not simulate execution or provide a transaction-safety verdict.

## Scope relative to the standard and other implementations

ERC-7730 defines descriptor semantics; package versions are independent of schema versions. The SDK accepts v1 and v2 descriptors, while the CLI generates v2 drafts. Schema validation checks document structure, not transaction safety or complete semantic coverage.

This toolkit provides a TypeScript runtime with pinned lookups, pluggable trust, nested decoding, and a JavaScript authoring CLI. Sourcify's TypeScript clear-signing implementation and Ledger's `python-erc7730` are comparison points, not interchangeable APIs or guarantees of identical output. Firmware conversion remains outside this SDK's scope. The [interop matrix](./interop.md) records covered cases; [divergences](./divergences.md) records resolver differences and the limits of the Python golden comparisons.

Adoption and upgrade commitments are in the [support policy](./support-policy.md).
