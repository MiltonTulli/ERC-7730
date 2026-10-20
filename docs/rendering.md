# Rendering a confirmation screen

`toScreens(operation)` turns a `DecodedOperation` into the blocks a wallet shows. It does not fetch. `clearSign` already sets `result.screens`.

```ts
import { clearSign, toScreens, type ClearSignScreens } from '@erc7730/sdk';

const signed = await clearSign({
  to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  data: '0xd0e30db0',
  value: 10n ** 18n,
  chainId: 1,
});

const screens: ClearSignScreens = signed.screens;
```

`verification` is `verified` only when `trust.accepted` is true and `source` is `official-registry` or `attested`. A curated descriptor the policy rejects is `rejected`. Everything else is `unverified`, and the headline is prefixed with `"Unverified: "` (pass `{ unverifiedPrefix }` to change it). Unverified and rejected screens also put `To` and the raw selector in `primary`.

Verification applies to the current operation's metadata, not transaction safety or all nested calls. Render child screens and warnings separately; see the [Safe outer-call example and runtime limitations](./trust-table.md#safe-outer-call-with-an-untrusted-inner-call).

`primary` is fields with `required === true`. `secondary` is `'implicit'` or `false`. The vendored WETH `deposit()` format has no required list, so Amount is secondary and the headline is `Wrap`.

`risks` follows warning severity, high then medium then low. `children` repeats the same shape for nested calls.

## Vanilla

```ts
function mountScreens(root: HTMLElement, screens: ClearSignScreens): void {
  root.replaceChildren();
  const title = document.createElement('h2');
  title.textContent = screens.headline;
  const status = document.createElement('p');
  status.textContent = screens.verificationLabel;
  root.append(status, title);
  for (const field of screens.primary) {
    const row = document.createElement('p');
    row.textContent = `${field.label}: ${field.value}`;
    root.append(row);
  }
  for (const risk of screens.risks) {
    const row = document.createElement('p');
    row.textContent = risk.message;
    root.append(row);
  }
}
```

## React

The [React confirmation example](https://github.com/MiltonTulli/ERC-7730/tree/main/examples/react-confirmation) is a buildable TypeScript app using the SDK's public exports. `Confirmation.tsx` owns loading, errors and stale-response protection; `Screen` renders headline, verification, both field groups, risks and child screens.

The example keeps `officialOnlyPolicy()` as the default. Its effect depends on scalar transaction values, so fresh object identities do not create decode loops. Cleanup ignores obsolete successes and errors, while an input snapshot check hides previous results as soon as the input changes. The README includes tested React versions, install/run commands, and instructions for exercising verified, fallback, malformed and rapidly changing inputs.

`field.value` stays a string. Structured data is on `DecodedField.details`, selected by `format`. For `format: 'calldata'`, the nested operation is `details.embedded`.
