import { type ClearSignScreens, type TransactionInput, clearSign } from '@erc7730/sdk';
import { useEffect, useMemo, useState } from 'react';

type Result =
  | { input: TransactionInput; status: 'ready'; screens: ClearSignScreens }
  | { input: TransactionInput; status: 'error'; message: string };

export function Confirmation({ transaction }: { transaction: TransactionInput }) {
  const { to, data, value, chainId, from } = transaction;
  // Depend on every scalar input, not the caller's object identity.
  const input = useMemo(
    () => ({ to, data, value, chainId, from }),
    [to, data, value, chainId, from]
  );
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    // The shared pinned registry and officialOnlyPolicy are the SDK defaults.
    // No RPC provider or signing client is needed.
    clearSign(input, { provider: null }).then(
      ({ screens }) => {
        if (active) setResult({ input, status: 'ready', screens });
      },
      (error: unknown) => {
        if (active) {
          setResult({
            input,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to decode transaction',
          });
        }
      }
    );
    // Covers input changes, unmounts and React StrictMode's effect replay.
    // This ignores obsolete work; it does not cancel registry network requests.
    return () => {
      active = false;
    };
  }, [input]);

  // Hide the previous result during the render before the new effect runs.
  if (!result || result.input !== input) {
    return <output>Loading transaction details…</output>;
  }
  if (result.status === 'error') {
    return <p role="alert">Unable to decode: {result.message}</p>;
  }
  return <Screen screens={result.screens} />;
}

export function Screen({ screens }: { screens: ClearSignScreens }) {
  return (
    <section className="screen" aria-label={screens.headline}>
      <p className="verification" data-verification={screens.verification}>
        {screens.verificationLabel}
      </p>
      <h2>{screens.headline}</h2>
      {screens.verification !== 'verified' && (
        <p role="note">Metadata is not verified. Review the destination and raw call carefully.</p>
      )}
      <dl>
        {[...screens.primary, ...screens.secondary].map((field, index) => (
          <div key={`${field.path ?? field.label}:${index}`}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
      {screens.risks.length > 0 && (
        <aside aria-label="Risks">
          <h3>Risks</h3>
          <ul>
            {screens.risks.map((risk, index) => (
              <li key={`${risk.type}:${risk.path ?? ''}:${index}`}>
                <strong>{risk.severity}:</strong> {risk.message}
              </li>
            ))}
          </ul>
        </aside>
      )}
      {screens.children?.map((child, index) => (
        <Screen key={`${index}:${child.headline}`} screens={child} />
      ))}
    </section>
  );
}
