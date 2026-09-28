import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultVerifiedAbiLoader, setDefaultVerifiedAbiLoader } from '../decode/abiLoader';
import { decodeTransaction } from '../decode/decodeTransaction';
import { enableSourcifyAbiLoader, sourcifyVerifiedAbiLoader } from '../providers/sourcify';
import { decodeViemTransaction } from '../viem';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const TO = '0x1234567890123456789012345678901234567890' as const;
const TRANSFER =
  '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000000000001' as const;

const transferAbi = {
  match: 'exact_match',
  abi: [
    {
      type: 'function',
      name: 'transfer',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
    },
  ],
};

function readSrc(name: string): string {
  return readFileSync(join(srcRoot, name), 'utf8');
}

afterEach(() => {
  setDefaultVerifiedAbiLoader(undefined);
  vi.unstubAllGlobals();
});

describe('Sourcify ABI loader opt-in', () => {
  it('does not register a loader from the package entries', () => {
    expect(decodeViemTransaction).toBeTypeOf('function');
    expect(getDefaultVerifiedAbiLoader()).toBeUndefined();
    for (const file of ['index.ts', 'viem.ts']) {
      expect(readSrc(file)).not.toMatch(/setDefaultVerifiedAbiLoader\s*\(/);
    }
    const lite = readSrc('lite.ts');
    expect(lite).not.toContain('providers/sourcify');
    expect(lite).not.toContain('enableSourcifyAbiLoader');
    expect(lite).not.toContain('fetchFromSourcify');
    expect(readSrc('index.ts')).toContain('enableSourcifyAbiLoader');
    expect(readSrc('index.ts')).toContain('sourcifyVerifiedAbiLoader');
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

  it('does not fetch after enableSourcifyAbiLoader unless the call opts in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    enableSourcifyAbiLoader();
    expect(getDefaultVerifiedAbiLoader()).toBe(sourcifyVerifiedAbiLoader);
    const result = await decodeTransaction(
      { to: TO, data: TRANSFER, chainId: 1 },
      { provider: null, useSourcifyFallback: false }
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.source).not.toBe('sourcify');
  });

  it('fetches after enableSourcifyAbiLoader when useSourcifyFallback is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(transferAbi), { status: 200 }))
    );
    enableSourcifyAbiLoader();
    const result = await decodeTransaction(
      { to: TO, data: TRANSFER, chainId: 1 },
      { provider: null, useSourcifyFallback: true }
    );
    expect(result.source).toBe('sourcify');
    expect(result.confidence).toBe('low');
  });

  it('fetches when the call passes sourcifyVerifiedAbiLoader', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(transferAbi), { status: 200 }))
    );
    const result = await decodeTransaction(
      { to: TO, data: TRANSFER, chainId: 1 },
      {
        provider: null,
        useSourcifyFallback: true,
        loadVerifiedAbi: sourcifyVerifiedAbiLoader,
      }
    );
    expect(getDefaultVerifiedAbiLoader()).toBeUndefined();
    expect(result.source).toBe('sourcify');
    expect(result.confidence).toBe('low');
  });
});
