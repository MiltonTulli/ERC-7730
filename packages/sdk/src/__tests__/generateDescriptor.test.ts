import { describe, expect, it } from 'vitest';
import {
  type ABI,
  generateDescriptor,
  inferFormat,
  inferIntent,
  looksLikeErc20,
  solidityEnumName,
} from '../generate/index.js';
import { validateDescriptor } from '../schema/validate.js';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

const ERC20_ABI: ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'permit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

const ROUTER_ABI: ABI = [
  {
    type: 'function',
    name: 'swapExactTokensForTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'addLiquidity',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'exactInputSingle',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
];

type FormatEntry = {
  intent?: string;
  fields: Array<{
    path?: string;
    label?: string;
    format?: string;
    params?: Record<string, unknown>;
  }>;
};

function formatsOf(descriptor: unknown): Record<string, FormatEntry> {
  const display = (descriptor as { display: { formats: Record<string, FormatEntry> } }).display;
  return display.formats;
}

function field(
  formats: Record<string, FormatEntry>,
  signature: string,
  path: string
): FormatEntry['fields'][number] {
  const found = formats[signature]?.fields.find((item) => item.path === path);
  if (!found) {
    throw new Error(`missing field ${path} on ${signature}`);
  }
  return found;
}

describe('generateDescriptor', () => {
  it('emits a v2-valid ERC-20 draft and matches snapshot', () => {
    const draft = generateDescriptor({
      chainId: 1,
      address: USDC,
      abi: ERC20_ABI,
      owner: 'Centre',
      contractName: 'USD Coin',
      url: 'https://www.circle.com/',
    });

    const validated = validateDescriptor(draft);
    expect(validated, JSON.stringify(validated)).toMatchObject({ ok: true, version: '2' });
    expect(draft.$schema).toContain('erc7730-v2');
    expect(draft.$comment).toMatch(/TODO/i);
    expect(draft.$comment).toMatch(/never a high-confidence/i);
    expect(draft).toMatchSnapshot();
  });

  it('emits a v2-valid router draft and matches snapshot', () => {
    const draft = generateDescriptor({
      chainId: 1,
      address: ROUTER,
      abi: ROUTER_ABI,
      owner: 'Uniswap',
      contractName: 'Uniswap V2 Router',
    });

    const validated = validateDescriptor(draft);
    expect(validated, JSON.stringify(validated)).toMatchObject({ ok: true, version: '2' });
    expect(draft).toMatchSnapshot();
  });

  it('applies ERC-20 tokenAmount tokenPath @.to and address/date heuristics', () => {
    const draft = generateDescriptor({
      chainId: 1,
      address: USDC,
      abi: ERC20_ABI,
      owner: 'Centre',
    });
    const formats = formatsOf(draft);

    expect(looksLikeErc20(ERC20_ABI)).toBe(true);
    expect(formats['balanceOf(address)']).toBeUndefined();

    expect(field(formats, 'transfer(address,uint256)', '#.to')).toMatchObject({
      format: 'addressName',
      params: { types: ['eoa', 'contract'] },
    });
    expect(field(formats, 'transfer(address,uint256)', '#.amount')).toMatchObject({
      format: 'tokenAmount',
      params: { tokenPath: '@.to' },
    });
    expect(field(formats, 'approve(address,uint256)', '#.spender')).toMatchObject({
      format: 'addressName',
      params: { types: ['contract'] },
    });
    expect(
      field(formats, 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', '#.value')
    ).toMatchObject({
      format: 'tokenAmount',
      params: { tokenPath: '@.to' },
    });
    expect(
      field(formats, 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', '#.deadline')
    ).toMatchObject({
      format: 'date',
      params: { encoding: 'timestamp' },
    });
    expect(formats['transfer(address,uint256)']?.intent).toBe('Transfer');
  });

  it('does not attach tokenPath @.to on a router ABI', () => {
    const draft = generateDescriptor({
      chainId: 1,
      address: ROUTER,
      abi: ROUTER_ABI,
      owner: 'Uniswap',
    });
    const formats = formatsOf(draft);
    const amountIn = field(
      formats,
      'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      '#.amountIn'
    );
    expect(amountIn.format).toBe('tokenAmount');
    expect(amountIn.params?.tokenPath).toBeUndefined();
    expect(
      field(
        formats,
        'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        '#.deadline'
      )
    ).toMatchObject({ format: 'date', params: { encoding: 'timestamp' } });
    expect(
      field(formats, 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)', '#.to')
    ).toMatchObject({ format: 'addressName' });
    expect(
      field(
        formats,
        'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',
        '#.params.recipient'
      )
    ).toMatchObject({ format: 'addressName' });
    expect(
      field(
        formats,
        'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',
        '#.params.amountIn'
      ).format
    ).toBe('tokenAmount');
    expect(
      field(
        formats,
        'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',
        '#.params.sqrtPriceLimitX96'
      ).format
    ).toBe('raw');
    expect(
      formats['exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))']?.intent
    ).toBe('Swap exact input amount');
  });

  it('maps Solidity enums into metadata.enums and format enum', () => {
    const draft = generateDescriptor({
      chainId: 1,
      address: '0x1111111111111111111111111111111111111111',
      abi: [
        {
          type: 'function',
          name: 'borrow',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'asset', type: 'address' },
            { name: 'amount', type: 'uint256' },
            {
              name: 'interestRateMode',
              type: 'uint8',
              internalType: 'enum IPool.InterestRateMode',
            },
          ],
        },
      ],
    });

    const validated = validateDescriptor(draft);
    expect(validated, JSON.stringify(validated)).toMatchObject({ ok: true, version: '2' });
    expect(draft.metadata?.enums).toEqual({ IPool_InterestRateMode: {} });
    expect(
      field(formatsOf(draft), 'borrow(address,uint256,uint8)', '#.interestRateMode')
    ).toMatchObject({
      format: 'enum',
      params: { $ref: '$.metadata.enums.IPool_InterestRateMode' },
    });
  });

  it('keeps distinct metadata.enums keys for qualified enums that share a final name', () => {
    const draft = generateDescriptor({
      chainId: 1,
      address: '0x1111111111111111111111111111111111111111',
      abi: [
        {
          type: 'function',
          name: 'setStatus',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'fromStatus', type: 'uint8', internalType: 'enum PoolA.Status' },
            { name: 'toStatus', type: 'uint8', internalType: 'enum PoolB.Status' },
          ],
        },
      ],
    });

    const validated = validateDescriptor(draft);
    expect(validated, JSON.stringify(validated)).toMatchObject({ ok: true, version: '2' });
    expect(draft.metadata?.enums).toEqual({ PoolA_Status: {}, PoolB_Status: {} });
    const formats = formatsOf(draft);
    expect(field(formats, 'setStatus(uint8,uint8)', '#.fromStatus')).toMatchObject({
      format: 'enum',
      params: { $ref: '$.metadata.enums.PoolA_Status' },
    });
    expect(field(formats, 'setStatus(uint8,uint8)', '#.toStatus')).toMatchObject({
      format: 'enum',
      params: { $ref: '$.metadata.enums.PoolB_Status' },
    });
  });

  it('falls back to Call {functionName} when no verb matches', () => {
    const draft = generateDescriptor({
      chainId: 1,
      address: '0x1111111111111111111111111111111111111111',
      abi: [
        {
          type: 'function',
          name: 'pokeOracle',
          stateMutability: 'nonpayable',
          inputs: [{ name: 'wad', type: 'uint256' }],
        },
      ],
    });
    const formats = formatsOf(draft);
    expect(formats['pokeOracle(uint256)']?.intent).toBe('Call pokeOracle');
    expect(field(formats, 'pokeOracle(uint256)', '#.wad')).toMatchObject({ format: 'tokenAmount' });
  });
});

describe('solidityEnumName', () => {
  it('keeps unqualified enum identifiers and path-safes qualified names', () => {
    expect(solidityEnumName('enum Status')).toBe('Status');
    expect(solidityEnumName('enum IPool.InterestRateMode')).toBe('IPool_InterestRateMode');
    expect(solidityEnumName('enum PoolA.Status')).toBe('PoolA_Status');
    expect(solidityEnumName('enum PoolB.Status')).toBe('PoolB_Status');
    expect(solidityEnumName('uint8')).toBeUndefined();
  });
});

describe('inferFormat', () => {
  it('maps amount / value / assets / wad to tokenAmount', () => {
    expect(inferFormat('amount', 'uint256').format).toBe('tokenAmount');
    expect(inferFormat('value', 'uint256').format).toBe('tokenAmount');
    expect(inferFormat('assets', 'uint256').format).toBe('tokenAmount');
    expect(inferFormat('wad', 'uint256').format).toBe('tokenAmount');
    expect(inferFormat('amount', 'uint256', { looksLikeErc20: true }).params).toEqual({
      tokenPath: '@.to',
    });
  });

  it('does not treat token as the short keyword to', () => {
    expect(inferFormat('token', 'address')).toMatchObject({
      format: 'addressName',
      params: { types: ['token'] },
    });
  });

  it('maps recipient / operator / expiry', () => {
    expect(inferFormat('recipient', 'address')).toMatchObject({
      format: 'addressName',
      params: { types: ['eoa', 'contract'] },
    });
    expect(inferFormat('operator', 'address')).toMatchObject({
      format: 'addressName',
      params: { types: ['contract'] },
    });
    expect(inferFormat('expiry', 'uint256')).toMatchObject({
      format: 'date',
      params: { encoding: 'timestamp' },
    });
  });
});

describe('inferIntent', () => {
  it('uses Call {functionName} as the fallback', () => {
    expect(inferIntent('pokeOracle')).toBe('Call pokeOracle');
    expect(inferIntent('transfer')).toBe('Transfer');
  });
});
