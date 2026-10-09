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

```tsx
function Confirm({ screens }: { screens: ClearSignScreens }) {
  return (
    <section>
      <p>{screens.verificationLabel}</p>
      <h2>{screens.headline}</h2>
      {screens.primary.map((field) => (
        <p key={field.path ?? field.label}>
          <strong>{field.label}</strong> {field.value}
        </p>
      ))}
      {screens.risks.map((risk) => (
        <p key={`${risk.type}:${risk.path ?? ''}`}>{risk.message}</p>
      ))}
    </section>
  );
}
```

`field.value` stays a string. Structured data is on `DecodedField.details`, selected by `format`. For `format: 'calldata'`, the nested operation is `details.embedded`.
