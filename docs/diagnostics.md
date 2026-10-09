# Why didn't my transaction decode?

`DecodedOperation.diagnostics` is the chain of decisions for one decode. It is always an array, including on a hit. `erc7730 preview --explain` prints the same chain as `stage code outcome message`.

`InvalidInputError` still throws. A broken calldata or address is not a diagnostic. An include or registry fetch that throws is recorded as `INCLUDE_FETCH_FAILED`, and decoding continues into the fallback so the wallet still has a screen.

## Codes

| Code | Stage | What happened | What to do |
| --- | --- | --- | --- |
| `REGISTRY_HIT` | registry-lookup | A descriptor came back for this chain and address | Read the next rows |
| `REGISTRY_NO_DESCRIPTOR` | registry-lookup | `findCalldata` / `findEip712` returned null | The contract is not in the pinned index. Fallback is unverified |
| `REGISTRY_SKIPPED` | registry-lookup | No registry was passed, or the call has no selector | Pass a registry, or treat an empty call as a value transfer |
| `INCLUDE_FETCH_FAILED` | include-resolve | Loading a descriptor or include threw | Check the registry pin, cache, and network. The decode still falls back |
| `CONTEXT_MATCHED` | context-match | Deployments, proxy, factory, or EIP-712 domain matched | Read the format row |
| `CHAIN_ID_MISMATCH` | context-match | A descriptor exists and none of its deployments use this `chainId` | Confirm the chain, or extend a descriptor that lists it |
| `CONTEXT_MISMATCH` | context-match | The descriptor did not bind to this address or domain | Do not show it as verified |
| `FORMAT_MATCHED` | format-match | The selector or EIP-712 type is in `display.formats` | The intent comes from that format |
| `SELECTOR_NOT_IN_FORMATS` | format-match | Context matched and the selector is not listed | The file is incomplete for this function. Fallback stays unverified |
| `TRUST_ACCEPTED` | trust | The active policy accepted the source | `screens.verification` can be `verified` for official or attested sources |
| `POLICY_REJECTED` | trust | `trust.accepted` is false | Show `rejected` when the source was a curated descriptor |
| `BUILTIN_FALLBACK` | fallback | ERC-20, ERC-721, or WETH builtin rendered the call | Unverified under `officialOnlyPolicy()` |
| `TRUSTED_TOKEN_FALLBACK` | fallback | A trusted-token template rendered the call | Unverified unless your policy accepts that source |
| `SOURCIFY_FALLBACK` | fallback | Sourcify ABI rendered the call | Unverified. Sourcify is opt-in |
| `INFERRED_FALLBACK` | fallback | A known 4-byte signature was inferred | Unverified |
| `BASIC_FALLBACK` | fallback | No descriptor and no known signature | Unverified. Primary rows are `to` and the raw selector |

Happy-path order for a pinned WETH `deposit()` is `REGISTRY_HIT`, `CONTEXT_MATCHED`, `FORMAT_MATCHED`, `TRUST_ACCEPTED`.

## Preview

```bash
erc7730 preview --data 0xd0e30db0 --to 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --chain-id 1 --value 1000000000000000000 --explain
```

A hit prints `registry-lookup REGISTRY_HIT hit`. An address with no file prints `registry-lookup REGISTRY_NO_DESCRIPTOR miss`.

See also [rendering](./rendering.md) and [observability](./observability.md).
