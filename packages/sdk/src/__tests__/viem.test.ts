import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import { decodeTypedData } from '../decode/decodeTypedData.js';
import type { DecodeOptions } from '../decode/types.js';

vi.mock('../decode/decodeTransaction.js', () => ({ decodeTransaction: vi.fn() }));
vi.mock('../decode/decodeTypedData.js', () => ({ decodeTypedData: vi.fn() }));

const to = '0x1111111111111111111111111111111111111111' as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('viem transaction adapter', () => {
  it('forwards the transaction and decode options without losing bigint precision', async () => {
    const adapter = await import('../viem.js');
    const tx = { to, data: '0x12345678' as const, chainId: 1, value: 2n ** 100n, from: to };
    const options: DecodeOptions = { provider: null, useSourcifyFallback: false, locale: 'es' };
    const result = { intent: 'test result' };
    vi.mocked(decodeTransaction).mockResolvedValueOnce(
      result as Awaited<ReturnType<typeof decodeTransaction>>
    );

    expect(await adapter.decodeViemTransaction(tx, options)).toBe(result);
    expect(decodeTransaction).toHaveBeenCalledTimes(1);
    expect(decodeTransaction).toHaveBeenCalledWith(tx, options);
  });

  it('preserves omitted options and propagates core failures', async () => {
    const adapter = await import('../viem.js');
    const tx = { to, data: '0x' as const, chainId: 1 };
    const error = new Error('registry unavailable');
    vi.mocked(decodeTransaction).mockRejectedValueOnce(error);
    await expect(adapter.decodeViemTransaction(tx)).rejects.toBe(error);
    expect(decodeTransaction).toHaveBeenCalledWith(tx, undefined);
  });
});

describe('viem typed-data adapter', () => {
  it('copies readonly type fields and forwards domain, message and options unchanged', async () => {
    const adapter = await import('../viem.js');
    const types = Object.freeze({
      Permit: Object.freeze([Object.freeze({ name: 'value', type: 'uint256' })]),
    });
    const domain = { chainId: 1n, verifyingContract: to };
    const message = { value: 2n ** 100n };
    const options: DecodeOptions = { provider: null, now: 123, useSourcifyFallback: false };
    const result = { intent: 'typed result' };
    vi.mocked(decodeTypedData).mockResolvedValueOnce(
      result as Awaited<ReturnType<typeof decodeTypedData>>
    );

    expect(
      await adapter.decodeViemTypedData({ types, domain, primaryType: 'Permit', message }, options)
    ).toBe(result);
    expect(decodeTypedData).toHaveBeenCalledTimes(1);
    expect(decodeTypedData).toHaveBeenCalledWith(
      { types, domain, primaryType: 'Permit', message },
      options
    );
    const [input, forwardedOptions] = vi.mocked(decodeTypedData).mock.calls[0];
    expect(input.types.Permit).not.toBe(types.Permit);
    expect(input.domain).toBe(domain);
    expect(input.message).toBe(message);
    expect(forwardedOptions).toBe(options);
  });

  it('normalizes an omitted domain to the empty domain required by the core', async () => {
    const adapter = await import('../viem.js');
    await adapter.decodeViemTypedData({ types: { Mail: [] }, primaryType: 'Mail', message: {} });
    expect(decodeTypedData).toHaveBeenCalledWith(
      { types: { Mail: [] }, primaryType: 'Mail', domain: {}, message: {} },
      undefined
    );
  });

  it('propagates typed-data core failures', async () => {
    const adapter = await import('../viem.js');
    const error = new Error('registry unavailable');
    vi.mocked(decodeTypedData).mockRejectedValueOnce(error);
    await expect(
      adapter.decodeViemTypedData({
        types: { Mail: [] },
        primaryType: 'Mail',
        message: {},
      })
    ).rejects.toBe(error);
  });
});

describe('viem package entry point', () => {
  it('exports a separate adapter entry point and keeps viem an optional peer', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.exports['./viem']).toEqual({ types: './dist/viem.d.ts', import: './dist/viem.js' });
    expect(pkg.peerDependencies.viem).toBe('^2.0.0');
    expect(pkg.peerDependenciesMeta.viem.optional).toBe(true);
    expect(pkg.dependencies.viem).toBeUndefined();
    const entry = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
    expect(entry).not.toMatch(/from ['"]\.\/viem\.js['"]/);
  });
});
