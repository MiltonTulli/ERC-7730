# React confirmation example

A minimal TypeScript + React browser application using the public `@erc7730/sdk` exports. This is a private example, not an `@erc7730/react` package or a reusable hook. It only decodes and displays transactions: no wallet connection, private keys, signing, broadcasting, or automatic approval.

## Install and run

From the repository root, with Node **22.18+** and pnpm **10.28.0**:

```bash
pnpm install --frozen-lockfile
pnpm --filter @erc7730/sdk build
pnpm --filter react-confirmation-example dev
```

Open the local URL printed by Vite. React and React DOM are pinned and tested at **19.3.1**, with TypeScript **5.9.3** and Vite **5.4.21**. This is a browser example, not an SSR or React Native support claim.

```bash
pnpm --filter react-confirmation-example typecheck
pnpm --filter react-confirmation-example build
pnpm --filter react-confirmation-example test
```

The example participates in the repository's Turbo build/test tasks and root typecheck, so CI runs these checks too. Its Turbo inputs include the HTML entry and Vite configuration.

To copy it into an existing React app, copy `src/Confirmation.tsx`, install `@erc7730/sdk`, and pass a `TransactionInput` to `Confirmation`. Keep your existing React setup; the `workspace:*` dependency here links the repository SDK and must be replaced with the desired published SDK version in a standalone project.

## Try the states

- **WETH deposit:** the official pinned registry normally produces `Wrap`, verified metadata, and Amount in the secondary fields. Network failure can instead produce an unverified builtin fallback; the UI never promotes it to verified.
- **Unverified approval:** an unknown contract's unlimited ERC-20 approval produces fallback output, the destination and selector, and risks.
- **Malformed input:** an invalid address produces an error and removes the previous screen.
- **Loading and rapid changes:** throttle the browser network, reload, then switch samples or edit destination, calldata, value, or chain ID before decoding finishes. The pending input shows loading, never the previous transaction's result. Automated tests control promise settlement to exercise out-of-order successes and failures deterministically.

`Screen` renders the SDK headline, verification label, primary and secondary fields, risks in SDK order, and nested calls with their own verification. Values are rendered as React text, never HTML. Verification describes metadata provenance, not transaction safety.

## Async behavior and trust

`Confirmation` memoizes a transaction snapshot from all five scalar `TransactionInput` fields. A new parent object with unchanged values does not retrigger decoding. BigInt is supported without JSON serialization. A value change starts a new effect; cleanup invalidates the earlier effect for both fulfillment and rejection, including StrictMode replay and unmounts.

Results retain their input snapshot. The render checks its identity against the current snapshot, hiding an old result even before the new effect runs. Cleanup ignores obsolete results; it does **not** abort shared registry requests.

The decode uses `clearSign(input, { provider: null })`. Omitting `registry` reuses the SDK's shared registry pinned to its vendored commit. Omitting `trust` preserves **`officialOnlyPolicy()`**. React, wagmi, and ethers are not added to the SDK dependency graph.

Tests use the real built SDK and an injected official-registry fetch fixture, with live networking blocked. `test/weth.json` mirrors the SDK's existing WETH descriptor fixture (with an absolute schema URL). This fixture is test data, not an independent claim that arbitrary local descriptors are official. Lifecycle tests defer the SDK call to control completion order.

## Optional RPC and transaction-hash lookup

Core decoding accepts a complete transaction, not a transaction hash. This example passes no RPC provider. The default registry may still fetch its pinned indexes and descriptors over HTTP; RPC-free does not mean offline.

If your application starts with a hash, look up the transaction with your existing RPC client **before** passing it to this component. Map destination to `to`, calldata/input to `data`, value in wei to `value` (bigint or integer string), the connected network to numeric `chainId`, and the optional sender to `from`. Handle missing/pending transactions, lookup errors and null destinations (contract creation) before rendering this contract-call example. Do not cast a null destination into an address.

Keep the RPC lookup's loading/error state and stale-response protection separate: changing the hash or network must invalidate its earlier lookup too. Optional metadata enrichment through the SDK's `provider` or `externalDataProvider` is another explicit integration choice. Neither lookup nor enrichment requires signing or broadcasting.

## Integration scope

| Integration | Status and gate |
| --- | --- |
| React browser | Implemented here as a private, buildable example. No hook package or wagmi integration. |
| ethers | Deferred: no named consumer and sample input demonstrate a gap in `TransactionInput` or typed-data APIs. Before implementing, record the major version (v6 by default; v5 only on explicit demand), exact conversion API, field/null normalization and tests. Any approved adapter must use an isolated subpath with optional peers and leave the SDK root graph unchanged. |
| React Native | Deferred/unverified: [#125](https://github.com/MiltonTulli/ERC-7730/issues/125) has no successful Metro build plus device/emulator smoke test for exact RN/Metro versions and configuration. CJS support alone would not satisfy this gate. |

See the [integration guide](../../docs/GUIDE.md), [rendering guidance](../../docs/rendering.md), and [runtime compatibility](../../docs/runtime-compatibility.md).
