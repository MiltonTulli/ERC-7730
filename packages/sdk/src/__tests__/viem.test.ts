import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeTypedData } from '../decode/decodeTypedData';
import type { DecodeOptions } from '../decode/types';

vi.mock('../decode/decodeTypedData', () => ({ decodeTypedData: vi.fn() }));

const to = '0x1111111111111111111111111111111111111111' as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('viem typed-data adapter', () => {
  it('copies readonly type fields and forwards domain, message and options unchanged', async () => {
    const adapter = await import('../decode/viemTypedData');
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
    const adapter = await import('../decode/viemTypedData');
    await adapter.decodeViemTypedData({ types: { Mail: [] }, primaryType: 'Mail', message: {} });
    expect(decodeTypedData).toHaveBeenCalledWith(
      { types: { Mail: [] }, primaryType: 'Mail', domain: {}, message: {} },
      undefined
    );
  });

  it('propagates typed-data core failures', async () => {
    const adapter = await import('../decode/viemTypedData');
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
  it('exports decodeViemTypedData from the root and drops the lite and viem subpaths', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.exports['./lite']).toBeUndefined();
    expect(pkg.exports['./viem']).toBeUndefined();
    expect(pkg.exports['./attest']).toEqual({
      types: './dist/attest.d.ts',
      import: './dist/attest.js',
    });
    expect(pkg.dependencies.viem).toBeUndefined();
    expect(pkg.dependencies.ox).toEqual(expect.any(String));
    expect(pkg.dependencies['@noble/hashes']).toEqual(expect.any(String));
    expect(pkg.peerDependencies?.viem).toBeUndefined();
    expect(pkg.peerDependenciesMeta).toBeUndefined();
    const entry = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
    expect(entry).toContain('decodeViemTypedData');
    expect(entry).not.toMatch(/from ['"]\.\/attest['"]/);
    expect(entry).not.toMatch(/from ['"]viem/);
  });
});
