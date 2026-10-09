# Case study: Ambire confirmation screen

Ambire reviews an account operation on the confirmation screen before it dispatches `handleSignAndBroadcastAccountOp`. That screen is the integration point: call `clearSign`, then render `screens` instead of the raw selector.

This page is the acceptance surface. It is not a fork of Ambire. The [playground](https://miltontulli.github.io/ERC-7730/demo/) runs the same `clearSign` path.

```ts
import { clearSign, toScreens } from '@erc7730/sdk';

const signed = await clearSign({
  to,
  data,
  value,
  chainId,
});

const screens = signed.screens ?? toScreens(signed);
```

Show `screens.headline`, `screens.verificationLabel`, `screens.primary`, and `screens.risks`. Treat `verified` as the only row that came from an accepted official or attested descriptor. `unverified` is prefixed and includes `To` plus the raw selector.

## Twenty calls on the vendored pin

Scored offline against the descriptors shipped with the SDK (`officialOnlyPolicy()`, no RPC). `clearSign` with no registry uses that same pin.

| Call | Selector or type | Source | Confidence | trust.accepted | screens.verification |
| --- | --- | --- | --- | --- | --- |
| ETH transfer | `0x` | basic | low | false | unverified |
| WETH deposit | `0xd0e30db0` | official-registry | high | true | verified |
| WETH withdraw | `0x2e1a7d4d` | builtin | low | false | unverified |
| USDC transfer | `0xa9059cbb` | builtin | low | false | unverified |
| USDT transfer | `0xa9059cbb` | official-registry | high | true | verified |
| USDT approve | `0x095ea7b3` | official-registry | high | true | verified |
| USDT infinite approve | `0x095ea7b3` | official-registry | high | true | verified |
| USDT transferFrom | `0x23b872dd` | builtin | low | false | unverified |
| Uniswap V3 swap | `0x472b43f3` | official-registry | high | true | verified |
| Aave supply | `0x617ba037` | official-registry | high | true | verified |
| Lido submit | `0xa1903eab` | official-registry | high | true | verified |
| wstETH wrap | `0xea598cb0` | official-registry | high | true | verified |
| Safe execTransaction | `0x6a761202` | official-registry | low | true | verified |
| ERC-721 safeTransferFrom | `0x42842e0e` | builtin | low | false | unverified |
| setApprovalForAll | `0xa22cb465` | builtin | low | false | unverified |
| USDC Permit | `Permit` | official-registry | high | true | verified |
| Permit2 PermitSingle | `PermitSingle` | official-registry | high | true | verified |
| Swell approve | `0x095ea7b3` | official-registry | high | true | verified |
| Universal Router | `0x24856bc3` | basic | low | false | unverified |
| Unknown contract | `0xdeadbeef` | basic | low | false | unverified |

WETH `deposit()` is the verified reference: mainnet `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`, calldata `0xd0e30db0`, value `10**18` wei. The vendored WETH file lists `deposit()` only, so `withdraw(uint256)` falls through to the WETH builtin and stays unverified.

Safe `execTransaction` stays `verified` because the outer descriptor is accepted. Confidence drops to `low` because the nested inner call is untrusted and caps the parent.

USDT `transferFrom` is not in the Tether file, so the ERC-20 builtin renders it. An infinite `approve` still matches the official format and stays verified; the unlimited amount is a warning on `screens.risks`, not a failed verification.

## Three calls the pin does not verify

These are not filed upstream. Open them in the playground.

**Ethereum USDC transfer.** USDC is on the EIP-712 index (Permit), not on `index.calldata.json`. A `transfer` is the ERC-20 builtin.

- chainId `1`
- to `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- data `0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100`
- [playground](https://miltontulli.github.io/ERC-7730/demo/?chainId=1&to=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&data=0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100)

**Bored Ape Yacht Club `safeTransferFrom`.** The collection is not in the calldata index. NFT marketplace contracts absent from the same index behave the same way: builtin or basic, never `verified`.

- chainId `1`
- to `0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D`
- data `0x42842e0e000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000abcdef1234567890abcdef1234567890abcdef120000000000000000000000000000000000000000000000000000000000000539`
- [playground](https://miltontulli.github.io/ERC-7730/demo/?chainId=1&to=0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D&data=0x42842e0e000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045000000000000000000000000abcdef1234567890abcdef1234567890abcdef120000000000000000000000000000000000000000000000000000000000000539)

**Uniswap Universal Router.** `0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD` is not in the vendored calldata index. `0x24856bc3` is `execute(bytes,bytes[])`.

- chainId `1`
- to `0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD`
- data `0x24856bc3`
- [playground](https://miltontulli.github.io/ERC-7730/demo/?chainId=1&to=0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD&data=0x24856bc3)
