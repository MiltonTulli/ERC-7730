# Interop matrix (v0.6)

How `@erc7730/sdk` compares to Ledger [`python-erc7730`](https://github.com/LedgerHQ/python-erc7730) (what official registry CI runs) and Sourcify [`@ethereum-sourcify/clear-signing`](https://github.com/sourcifyeth/clear-signing).

**Positioning:** this package complements Sourcify — pinned official registry, pluggable trust policy, nested execution, and a JS authoring CLI next to `python-erc7730`. It is not a second registry and does not claim to be the reference TypeScript implementation.

Resolve / lint slice vs python-erc7730: see [`divergences.md`](./divergences.md) and `pnpm golden:python`.

## Nested execution

| Case | `@erc7730/sdk` | Sourcify TS | Notes |
| --- | --- | --- | --- |
| Multicall3 `aggregate` / `aggregate3` | Parent + `children[]` | Single call / EIP-5792 batch only | Each child runs the full decode + policy pipeline |
| Safe `execTransaction` CALL (`operation=0`) | One child | — | DELEGATECALL is not expanded |
| Simple Account UserOp `execute` / `executeBatch` | `decodeUserOp` → children | — | Other 4337 account flavors out of scope |
| EIP-5792 batch | `decodeBatch` (0.5) | `formatEip5792Batch` | Same `" and "` join |

## EIP-712 index gap

The GitHub `index.eip712.json` only keys descriptors on `context.eip712.deployments`. Descriptors that bind solely via `domain` or `domainSeparator` cannot be pre-indexed ([Sourcify known limitation](https://github.com/sourcifyeth/clear-signing#known-limitation--eip-712-index-coverage)).

This SDK matches those descriptors when they are loaded through `extend()` (or a local overlay) by running `matchContext` against the typed-data domain. It does not scan the GitHub tree on an index miss.

## Fixture matrix (recorded calldata / messages — no live RPC)

| Fixture | python-erc7730 | Sourcify `format()` | `@erc7730/sdk` |
| --- | --- | --- | --- |
| WETH `deposit` | golden resolve/lint | not snapshotted in CI | `decodeTransaction` / `format` |
| USDT transfer | golden | not snapshotted | decode + tokenAmount |
| USDT approve | golden | not snapshotted | decode + `untrusted_spender` |
| USDC transfer (mock official) | n/a (not in calldata index) | not snapshotted | decode + interpolatedIntent |
| USDC Permit (EIP-712) | golden | not snapshotted | `decodeTypedData` / `formatTypedData` |
| Lido stETH submit | golden | not snapshotted | decode |
| Uniswap V3 router | golden | not snapshotted | decode |
| Safe 1.4.1 proxy | golden | not snapshotted | matchContext + decode |
| Multicall3 × 2 transfers | n/a | n/a | `children.length === 2` |
| Simple Account `execute` | n/a | n/a | `decodeUserOp` one child |
| Domain-only EIP-712 override | n/a | index miss | `extend()` + domain match |

Sourcify `format()` is not snapshotted here: their default resolver fetches the registry at call time. Mapping their `DisplayModel` onto `DecodedOperation` is fine for wallets; this package keeps `DecodedOperation` as the source of truth (`format` / `formatTypedData` are thin aliases).

## Trust reason codes

`trust.reasons` are stable strings (`source:<source>:accepted|rejected`, `untrusted_descriptor`, `ATTESTED`, `NO_TRUSTED_ATTESTATION`, …). See `TRUST_REASON_CODES` in `@erc7730/sdk`. Warning `type` values stay the `#12` union — no third taxonomy. Wallet spender allowlist: `DecodeOptions.spenderAllowlist`.
