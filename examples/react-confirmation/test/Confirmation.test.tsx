import {
  type ClearSignScreens,
  type ClearSignedOperation,
  type TransactionInput,
  clearSign,
  createOfficialRegistry,
} from '@erc7730/sdk';
import { StrictMode, act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Confirmation, Screen } from '../src/Confirmation';
import { fixtures } from '../src/fixtures';
import weth from './weth.json';

vi.mock('@erc7730/sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@erc7730/sdk')>();
  return { ...sdk, clearSign: vi.fn(sdk.clearSign) };
});

const sdk = await vi.importActual<typeof import('@erc7730/sdk')>('@erc7730/sdk');
const decode = vi.mocked(clearSign);
let container: HTMLDivElement;
let root: Root;
let verified: ClearSignedOperation;
let fallback: ClearSignedOperation;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // No live network. Exercise the real SDK against a pinned-registry fixture.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Unexpected live fetch')))
  );
  const registry = createOfficialRegistry({
    indexes: {
      calldata: {
        'eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'registry/weth/calldata-weth.json',
      },
      eip712: {},
    },
    fetch: async (url) => {
      if (!String(url).endsWith('/registry/weth/calldata-weth.json')) {
        throw new Error(`Unexpected fixture URL: ${url}`);
      }
      return Response.json(weth);
    },
  });
  decode.mockReset();
  decode.mockImplementation((input, options) => sdk.clearSign(input, { ...options, registry }));
  verified = await sdk.clearSign(fixtures.verified, { registry, provider: null });
  fallback = await sdk.clearSign(fixtures.fallback, { registry, provider: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

async function render(transaction: TransactionInput) {
  await act(async () => root.render(<Confirmation transaction={transaction} />));
}

function deferred() {
  let resolve!: (result: ClearSignedOperation) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ClearSignedOperation>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('real SDK fixtures', () => {
  it('renders official verification, headline and secondary fields', async () => {
    await render(fixtures.verified);
    expect(container.querySelector('[data-verification="verified"]')).not.toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe('Wrap');
    expect(container.textContent).toContain('Amount');
    expect(container.textContent).toContain('1 ETH');
    expect(decode).toHaveBeenCalledWith(expect.anything(), { provider: null });
  });

  it('renders fallback verification, destination, selector and risks', async () => {
    await render(fixtures.fallback);
    expect(container.querySelector('[data-verification="unverified"]')).not.toBeNull();
    expect(container.querySelector('h2')?.textContent).toMatch(/^Unverified:/);
    expect(container.textContent).toContain(fixtures.fallback.to);
    expect(container.textContent).toContain('0x095ea7b3');
    expect(container.querySelector('aside')?.textContent).toContain('Risks');
    expect(container.querySelectorAll('aside li').length).toBeGreaterThan(0);
  });

  it('replaces a valid screen with an error for malformed input, then recovers', async () => {
    await render(fixtures.verified);
    await render(fixtures.malformed);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Unable to decode');
    expect(container.querySelector('h2')).toBeNull();
    await render(fixtures.fallback);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-verification="unverified"]')).not.toBeNull();
  });
});

describe('async lifecycle', () => {
  it('shows loading and does not decode again for a fresh object with the same values', async () => {
    const pending = deferred();
    decode.mockReturnValue(pending.promise);
    await render(fixtures.verified);
    expect(container.querySelector('output')?.textContent).toContain('Loading');
    await render({ ...fixtures.verified });
    expect(decode).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(verified));
    await render({ ...fixtures.verified });
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores an obsolete %s after the newest result is visible',
    async (settle) => {
      const old = deferred();
      const current = deferred();
      decode.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      await render(fixtures.verified);
      await render(fixtures.fallback);
      await act(async () => current.resolve(fallback));
      await act(async () => {
        if (settle === 'resolve') old.resolve(verified);
        else old.reject(new Error('Old request failed'));
      });
      expect(container.querySelector('[data-verification="unverified"]')).not.toBeNull();
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('h2')?.textContent).not.toBe('Wrap');
    }
  );

  it('hides the previous screen while the next input is pending', async () => {
    await render(fixtures.verified);
    const pending = deferred();
    decode.mockReturnValueOnce(pending.promise);
    await render(fixtures.fallback);
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('output')).not.toBeNull();
    await act(async () => pending.resolve(fallback));
  });

  it('handles A → B → A without accepting the first A response', async () => {
    const first = deferred();
    const second = deferred();
    const third = deferred();
    decode
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    await render(fixtures.verified);
    await render(fixtures.fallback);
    await render(fixtures.verified);
    await act(async () => first.resolve(verified));
    expect(container.querySelector('output')).not.toBeNull();
    await act(async () => third.resolve(verified));
    await act(async () => second.resolve(fallback));
    expect(container.querySelector('[data-verification="verified"]')).not.toBeNull();
  });

  it('re-decodes each changed scalar input including bigint value and sender', async () => {
    let transaction: TransactionInput = { ...fixtures.verified };
    await render(transaction);
    for (const patch of [
      { to: fixtures.fallback.to },
      { data: fixtures.fallback.data },
      { value: 2n },
      { chainId: 10 },
      { from: fixtures.fallback.to },
    ]) {
      transaction = { ...transaction, ...patch };
      await render(transaction);
    }
    expect(decode).toHaveBeenCalledTimes(6);
  });

  it('ignores StrictMode replay and work completing after unmount', async () => {
    const first = deferred();
    const second = deferred();
    decode.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await act(async () =>
      root.render(
        <StrictMode>
          <Confirmation transaction={fixtures.verified} />
        </StrictMode>
      )
    );
    expect(decode).toHaveBeenCalledTimes(2);
    await act(async () => first.resolve(verified));
    expect(container.querySelector('output')).not.toBeNull();
    await act(async () => root.render(null));
    await act(async () => second.reject(new Error('Completed after unmount')));
    expect(container.textContent).toBe('');
  });
});

it('renders nested verification and risks separately and escapes descriptor text', async () => {
  const screens: ClearSignScreens = {
    ...verified.screens,
    headline: '<img src=x onerror=alert(1)>',
    children: [
      {
        ...fallback.screens,
        verification: 'rejected',
        verificationLabel: 'Rejected by trust policy',
      },
    ],
  };
  await act(async () => root.render(<Screen screens={screens} />));
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain(screens.headline);
  expect(container.querySelector('[data-verification="verified"]')).not.toBeNull();
  expect(container.querySelector('[data-verification="rejected"]')).not.toBeNull();
  expect(container.querySelector('aside')).not.toBeNull();
});
