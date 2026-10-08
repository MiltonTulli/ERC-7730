import { encodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';
import { decodeTransaction } from '../decode/decodeTransaction';
import type { DecodedOperation } from '../decode/types';

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const SENDER = '0xab5801a7d398351b8be11c439e05c5b3259aec9b';

function call(name: string, inputs: Array<{ name: string; type: string }>, args: unknown[]) {
  return encodeFunctionData({
    abi: [
      {
        type: 'function',
        name,
        stateMutability: 'nonpayable',
        inputs,
        outputs: [],
      },
    ],
    functionName: name,
    args,
  });
}

function expectInferred(result: DecodedOperation) {
  expect(result.source).toBe('inferred');
  expect(result.confidence).toBe('low');
  expect(result.trust).toMatchObject({ accepted: false, policy: 'official-only' });
  expect(result.fields.map((field) => field.label)).not.toContain('Param 1');
}

describe('zero-config decodeTransaction', () => {
  it('labels transfer arguments', async () => {
    const result = await decodeTransaction({
      to: USDT,
      chainId: 1,
      data: call(
        'transfer',
        [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        [RECIPIENT, 100_000_000n]
      ),
    });

    expectInferred(result);
    expect(result.intent).toBe('Send tokens');
    expect(result.fields.map((field) => ({ label: field.label, path: field.path }))).toEqual([
      { label: 'To', path: 'to' },
      { label: 'Amount', path: 'amount' },
    ]);
  });

  it('labels approve arguments', async () => {
    const result = await decodeTransaction({
      to: USDT,
      chainId: 1,
      data: call(
        'approve',
        [
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        [RECIPIENT, 100_000_000n]
      ),
    });

    expectInferred(result);
    expect(result.intent).toBe('Approve spending');
    expect(result.fields.map((field) => field.label)).toEqual(['Spender', 'Amount']);
    expect(result.fields.map((field) => field.path)).toEqual(['spender', 'amount']);
  });

  it('labels transferFrom and leaves from uncapitalized', async () => {
    const result = await decodeTransaction({
      to: USDT,
      chainId: 1,
      data: call(
        'transferFrom',
        [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        [SENDER, RECIPIENT, 100_000_000n]
      ),
    });

    expectInferred(result);
    expect(result.fields.map((field) => field.label)).toEqual(['from', 'To', 'Amount']);
    expect(result.fields.map((field) => field.path)).toEqual(['from', 'to', 'amount']);
  });

  it('decodes deposit with no parameters', async () => {
    const result = await decodeTransaction({
      to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      chainId: 1,
      data: '0xd0e30db0',
      value: 10n ** 18n,
    });

    expectInferred(result);
    expect(result.intent).toBe('Deposit');
    expect(result.fields).toEqual([]);
  });
});
