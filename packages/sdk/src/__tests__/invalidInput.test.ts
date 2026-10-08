import { describe, expect, it } from 'vitest';
import { decodeBatch } from '../decode/decodeBatch';
import { decodeTransaction } from '../decode/decodeTransaction';
import { decodeTypedData } from '../decode/decodeTypedData';
import { decodeUserOp } from '../decode/decodeUserOp';
import { InvalidInputError } from '../errors';
import type { TransactionInput, TypedDataInput } from '../types';

const TO = '0x1234567890123456789012345678901234567890' as const;
const options = { provider: null, useSourcifyFallback: false } as const;

function tx(partial: Partial<TransactionInput> & Record<string, unknown>): TransactionInput {
  return { to: TO, data: '0x', chainId: 1, ...partial } as TransactionInput;
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidInputError);
    return (error as InvalidInputError).code;
  }
  throw new Error('expected InvalidInputError');
}

describe('validateTransactionInput', () => {
  it.each([
    [{ to: 'not-an-address' }, 'INVALID_ADDRESS'],
    [{ from: '0x1234' }, 'INVALID_ADDRESS'],
    [{ data: 'zzzz' }, 'INVALID_HEX'],
    [{ data: '0xzz' }, 'INVALID_HEX'],
    [{ data: '0xa9059cbb0' }, 'INVALID_HEX'],
    [{ data: '0x1234' }, 'INVALID_CALLDATA'],
    [{ data: '0xa9059cbb0000' }, 'INVALID_CALLDATA'],
    [{ chainId: 0 }, 'INVALID_CHAIN_ID'],
    [{ chainId: 1.5 }, 'INVALID_CHAIN_ID'],
    [{ chainId: -1 }, 'INVALID_CHAIN_ID'],
    [{ value: -1n }, 'INVALID_CALLDATA'],
    [{ value: '1 ETH' }, 'INVALID_CALLDATA'],
  ] as const)('rejects a bad transaction with %s', async (partial, code) => {
    await expect(decodeTransaction(tx(partial), options)).rejects.toMatchObject({
      name: 'InvalidInputError',
      code,
    });
    await expect(codeOf(() => decodeTransaction(tx(partial), options))).resolves.toBe(code);
  });

  it('accepts empty calldata, a bare selector, and one ABI word', async () => {
    const word = `0x${'ab'.repeat(32)}`;
    for (const data of ['0x', '0xa9059cbb', `0xa9059cbb${word.slice(2)}`] as const) {
      const result = await decodeTransaction(tx({ data }), options);
      expect(result.trust.policy).toBe('official-only');
    }
  });

  it('rejects a bad call inside a batch and a bad UserOp', async () => {
    expect(await codeOf(() => decodeBatch({ chainId: 0, calls: [] }, options))).toBe(
      'INVALID_CHAIN_ID'
    );
    expect(
      await codeOf(() => decodeBatch({ chainId: 1, calls: [tx({ data: '0x1234' })] }, options))
    ).toBe('INVALID_CALLDATA');
    expect(
      await codeOf(() => decodeUserOp({ chainId: 1, sender: TO, callData: '0x1234' }, options))
    ).toBe('INVALID_CALLDATA');
    expect(
      await codeOf(() =>
        decodeUserOp({ chainId: 1, sender: '0xnope' as `0x${string}`, callData: '0x' }, options)
      )
    ).toBe('INVALID_ADDRESS');
  });
});

describe('validateTypedDataInput', () => {
  it.each([
    [{}, 'INVALID_TYPED_DATA'],
    [{ primaryType: 'Permit', types: {}, message: {} }, 'INVALID_TYPED_DATA'],
    [
      {
        primaryType: '',
        domain: {},
        types: { Permit: [] },
        message: {},
      },
      'INVALID_TYPED_DATA',
    ],
    [
      {
        primaryType: 'Permit',
        domain: { chainId: -1 },
        types: { Permit: [] },
        message: {},
      },
      'INVALID_CHAIN_ID',
    ],
    [
      {
        primaryType: 'Permit',
        domain: { verifyingContract: '0x1234' },
        types: { Permit: [] },
        message: {},
      },
      'INVALID_ADDRESS',
    ],
  ] as const)('rejects malformed typed data with %s', async (input, code) => {
    await expect(decodeTypedData(input as TypedDataInput, options)).rejects.toMatchObject({ code });
  });

  it('keeps a missing chain id unset', async () => {
    const result = await decodeTypedData(
      {
        primaryType: 'Note',
        domain: {},
        types: { Note: [{ name: 'text', type: 'string' }] },
        message: { text: 'hi' },
      },
      options
    );
    expect(result.metadata.chainId).toBeUndefined();
    expect(result.intent).toBe('Sign Note');
  });
});
