import type { TransactionInput } from '@erc7730/sdk';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Confirmation } from './Confirmation';
import { fixtures } from './fixtures';
import './style.css';

function App() {
  const [transaction, setTransaction] = useState<TransactionInput>(fixtures.verified);
  return (
    <main>
      <header>
        <p>ERC-7730 / React example</p>
        <h1>Review transaction</h1>
        <p>Decode and inspect only. This example cannot sign or send a transaction.</p>
      </header>
      <section aria-label="Transaction input" className="input">
        <h2>Transaction input</h2>
        <p>Switch samples or edit the input while loading to exercise changing transactions.</p>
        <div className="samples">
          <button type="button" onClick={() => setTransaction(fixtures.verified)}>
            WETH deposit
          </button>
          <button type="button" onClick={() => setTransaction(fixtures.fallback)}>
            Unverified approval
          </button>
          <button type="button" onClick={() => setTransaction(fixtures.malformed)}>
            Malformed input
          </button>
        </div>
        <label>
          Destination
          <input
            value={transaction.to}
            onChange={(event) =>
              setTransaction({ ...transaction, to: event.target.value as `0x${string}` })
            }
          />
        </label>
        <label>
          Calldata
          <textarea
            value={transaction.data}
            onChange={(event) =>
              setTransaction({ ...transaction, data: event.target.value as `0x${string}` })
            }
          />
        </label>
        <div className="numbers">
          <label>
            Value (wei)
            <input
              value={String(transaction.value ?? '0')}
              onChange={(event) => setTransaction({ ...transaction, value: event.target.value })}
            />
          </label>
          <label>
            Chain ID
            <input
              type="number"
              value={Number.isNaN(transaction.chainId) ? '' : transaction.chainId}
              onChange={(event) =>
                setTransaction({ ...transaction, chainId: event.target.valueAsNumber })
              }
            />
          </label>
        </div>
      </section>
      <div className="result" aria-live="polite" aria-atomic="true">
        <Confirmation transaction={{ ...transaction }} />
      </div>
      <footer>
        Verification applies to metadata, not transaction safety. Nested calls have their own
        verification and risks.
      </footer>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
