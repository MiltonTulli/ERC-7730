import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { describe, expect, it } from 'vitest';
import { computeSelector } from '../core/signatures.js';
import { canonicalizeDeclaration, decodeNamedArgs, parseDeclaration } from '../decode/abi.js';

const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('parseDeclaration', () => {
  it('strips data-location modifiers and canonicalizes uint', () => {
    const parsed = parseDeclaration('foo(bytes calldata payload, uint amount)');
    expect(parsed).toMatchObject({
      name: 'foo',
      canonical: 'foo(bytes,uint256)',
      params: [
        { type: 'bytes', name: 'payload' },
        { type: 'uint256', name: 'amount' },
      ],
    });
    expect(parsed?.selector).toBe(computeSelector('foo(bytes,uint256)'));
    expect(canonicalizeDeclaration('foo(bytes calldata payload, uint amount)')).toBe(
      'foo(bytes,uint256)'
    );
  });

  it('keeps already-canonical declarations', () => {
    const parsed = parseDeclaration('transfer(address,uint256)');
    expect(parsed).toMatchObject({
      name: 'transfer',
      canonical: 'transfer(address,uint256)',
      params: [{ type: 'address' }, { type: 'uint256' }],
    });
  });

  it('parses Solidity names on tuple fields', () => {
    const parsed = parseDeclaration(
      'exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params)'
    );
    expect(parsed?.params[0]).toMatchObject({
      type: '(address,address,uint24,address,uint256,uint256,uint160)',
      name: 'params',
    });
    expect(parsed?.params[0]?.components?.map((item) => item.name)).toEqual([
      'tokenIn',
      'tokenOut',
      'fee',
      'recipient',
      'amountIn',
      'amountOutMinimum',
      'sqrtPriceLimitX96',
    ]);
  });
});

describe('decodeNamedArgs', () => {
  it('does not label a failed decode as the first named argument', () => {
    const declaration = parseDeclaration('transfer(address to, uint256 value)');
    const result = decodeNamedArgs('0xa9059cbbdead', declaration);
    expect(result.named).toEqual({});
    expect(result.positional).toEqual(['dead']);
  });

  it('nests fixed-size tuple arrays so item fields can be named', () => {
    const declaration = parseDeclaration('batch((address to, uint256 value)[2] items)');
    expect(declaration).not.toBeNull();
    const encoded = encodeAbiParameters(parseAbiParameters('(address,uint256)[2]'), [
      [
        [VITALIK, 1n],
        ['0x0000000000000000000000000000000000000001', 2n],
      ],
    ]);
    const data = `${declaration?.selector}${encoded.slice(2)}`;
    const result = decodeNamedArgs(data, declaration);
    const items = result.named.items as Array<Record<string, unknown>>;
    expect(items[0]?.to).toBe(VITALIK);
    expect(items[0]?.value).toBe(1n);
    expect(items[1]?.to).toBe('0x0000000000000000000000000000000000000001');
    expect(items[1]?.value).toBe(2n);
  });
});
