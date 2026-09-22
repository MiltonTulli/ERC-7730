import type { TransactionRequest, TypedDataDefinition } from 'viem';
import { describe, expect, it } from 'vitest';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import { decodeTypedData } from '../decode/decodeTypedData.js';
import { officialOnlyPolicy } from '../trust/index.js';
import { decodeViemTransaction, decodeViemTypedData } from '../viem.js';

const to = '0x1111111111111111111111111111111111111111' as const;
const options = {
  provider: null,
  useSourcifyFallback: false,
  trust: officialOnlyPolicy(),
  now: 123,
};

const tx = {
  to,
  data: '0x12345678',
  chainId: 1,
  value: 0n,
} as const satisfies TransactionRequest & { chainId: number };
const typedData = {
  domain: { chainId: 1n, verifyingContract: to },
  types: { Mail: [{ name: 'contents', type: 'string' }] },
  primaryType: 'Mail',
  message: { contents: 'Hello' },
} as const satisfies TypedDataDefinition;

describe('viem adapters with the real decode core', () => {
  it.each([
    {
      domain: { name: 'Unsigned label', chainId: 1 },
      types: { EIP712Domain: [] },
    },
    { domain: { version: '' } },
  ] as const)(
    'does not display unsigned domain properties with an empty effective schema: %j',
    async (input) => {
      const result = await decodeViemTypedData({ primaryType: 'EIP712Domain', ...input }, options);
      expect(result.signature).toBe('EIP712Domain()');
      expect(result.fields).toEqual([]);
      expect(result.raw.message).toEqual({});
      expect(result.metadata.chainId).toBe('chainId' in input.domain ? input.domain.chainId : 0);
      expect(result.source).toBe('inferred');
      expect(result.confidence).toBe('low');
      expect(result.trust.accepted).toBe(false);
      expect(result.trust.policy).toBe('official-only');
    }
  );

  it('decodes domain-only fields in canonical order without types or message', async () => {
    const domain = Object.freeze({
      salt: `0x${'11'.repeat(32)}` as const,
      verifyingContract: to,
      chainId: 0n,
      version: '1',
      name: '',
    });
    // biome-ignore lint/complexity/noBannedTypes: Regress viem's valid empty-schema domain definition exactly.
    const input: TypedDataDefinition<{}, 'EIP712Domain'> = {
      primaryType: 'EIP712Domain',
      domain,
    };
    const result = await decodeViemTypedData(input, options);
    expect(result.signature).toBe(
      'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)'
    );
    expect(result.fields.map(({ path, rawValue }) => [path, rawValue])).toEqual([
      ['name', ''],
      ['version', '1'],
      ['chainId', 0n],
      ['verifyingContract', to],
      ['salt', domain.salt],
    ]);
    expect(result.raw.message).toEqual(domain);
    expect(result.source).toBe('inferred');
    expect(result.confidence).toBe('low');
    expect(result.trust.accepted).toBe(false);
    expect(result.trust.policy).toBe('official-only');
  });

  it('honors explicit readonly domain types instead of deriving them', async () => {
    const result = await decodeViemTypedData(
      {
        primaryType: 'EIP712Domain',
        domain: { name: 'Example', version: '' },
        types: { EIP712Domain: [{ name: 'version', type: 'string' }] } as const,
      },
      options
    );
    expect(result.signature).toBe('EIP712Domain(string version)');
    expect(result.fields.map(({ path, value }) => [path, value])).toEqual([['version', '']]);
  });

  it('supports an empty domain and omits an empty version from derived types', async () => {
    for (const domain of [{}, { name: 'Example', version: '' }]) {
      const result = await decodeViemTypedData({ primaryType: 'EIP712Domain', domain }, options);
      expect(result.signature).toBe(
        'name' in domain ? 'EIP712Domain(string name)' : 'EIP712Domain()'
      );
      expect(result.fields.map(({ path }) => path)).toEqual('name' in domain ? ['name'] : []);
    }
  });

  it('preserves transaction fallback confidence, warnings and trust', async () => {
    const result = await decodeViemTransaction(tx, options);
    expect(result).toEqual(await decodeTransaction(tx, options));
    expect(result.confidence).toBe('low');
    expect(result.trust.accepted).toBe(false);
  });

  it('accepts a readonly viem typed-data definition and preserves trust', async () => {
    const result = await decodeViemTypedData(typedData, options);
    expect(result).toEqual(
      await decodeTypedData(
        {
          ...typedData,
          types: { Mail: [...typedData.types.Mail] },
        },
        options
      )
    );
    expect(result.raw.message).toEqual(typedData.message);
    expect(result.metadata.chainId).toBe(1);
    expect(result.trust.accepted).toBe(false);
  });

  it('decodes a domainless message rather than inventing a chain or trusted source', async () => {
    const result = await decodeViemTypedData(
      {
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      },
      options
    );
    expect(result.metadata.chainId).toBe(0);
    expect(result.source).toBe('inferred');
    expect(result.trust.accepted).toBe(false);
  });
});
