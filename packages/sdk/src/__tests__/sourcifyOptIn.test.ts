import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeTransaction } from '../decode/decodeTransaction';
import { sourcifyVerifiedAbiLoader } from '../providers/sourcify';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const TO = '0x1234567890123456789012345678901234567890' as const;
const TRANSFER =
  '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000000000001' as const;

function readSrc(name: string): string {
  return readFileSync(join(srcRoot, name), 'utf8');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sourcify ABI loader opt-in', () => {
  it('does not register a loader from the package entries', () => {
    for (const file of ['index.ts', 'providers/sourcify.ts', 'decode/abiLoader.ts']) {
      expect(readSrc(file)).not.toMatch(/setDefaultVerifiedAbiLoader\s*\(/);
      expect(readSrc(file)).not.toContain('enableSourcifyAbiLoader');
    }
    expect(readSrc('index.ts')).toContain('sourcifyVerifiedAbiLoader');
    expect(readSrc('index.ts')).toContain('decodeViemTypedData');
  });

  it('does not fetch when useSourcifyFallback is true and no loader is set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await decodeTransaction(
      { to: TO, data: TRANSFER, chainId: 1 },
      { provider: null, useSourcifyFallback: true }
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.source).not.toBe('sourcify');
  });

  it('does not fetch when a loader is passed but useSourcifyFallback is false', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await decodeTransaction(
      { to: TO, data: TRANSFER, chainId: 1 },
      {
        provider: null,
        useSourcifyFallback: false,
        loadVerifiedAbi: sourcifyVerifiedAbiLoader,
      }
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.source).not.toBe('sourcify');
  });

  it('fetches when the call passes sourcifyVerifiedAbiLoader', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              match: 'exact_match',
              abi: [
                {
                  type: 'function',
                  name: 'mint',
                  inputs: [{ name: 'amount', type: 'uint256' }],
                  stateMutability: 'nonpayable',
                },
              ],
            }),
            { status: 200 }
          )
      )
    );
    const result = await decodeTransaction(
      {
        to: TO,
        data: '0xa0712d680000000000000000000000000000000000000000000000000000000000000001',
        chainId: 1,
      },
      {
        provider: null,
        useSourcifyFallback: true,
        loadVerifiedAbi: sourcifyVerifiedAbiLoader,
      }
    );
    expect(result.source).toBe('sourcify');
    expect(result.confidence).toBe('low');
  });
});
