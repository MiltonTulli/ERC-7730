import { type Hex, encodeFunctionData, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';
import { format } from '../decode/compat.js';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import type { DecodeRegistry } from '../decode/types.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import { officialOrLocalPolicy } from '../trust/policy.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as const;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;
const SAFE = '0x41675C099F32341bf84BFc5382aF534df5C7461a' as const;
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as const;
const SPENDER = '0x1111111111111111111111111111111111111111' as const;

const multicallAbi = parseAbi([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls)',
]);
const erc20Abi = parseAbi([
  'function transfer(address to, uint256 value)',
  'function approve(address spender, uint256 value)',
  'function setApprovalForAll(address operator, bool approved)',
]);
const safeAbi = parseAbi([
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)',
]);

function tokenDescriptor(address: string, ticker: string, decimals: number): InputDescriptor {
  return {
    $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
    context: {
      $id: ticker,
      contract: {
        deployments: [{ chainId: 1, address }],
      },
    },
    metadata: {
      owner: ticker,
      contractName: ticker,
      info: { url: 'https://example.com/', deploymentDate: '2020-01-01T00:00:00Z' },
      token: { name: ticker, ticker, decimals },
    },
    display: {
      formats: {
        'transfer(address to,uint256 value)': {
          intent: 'Send',
          interpolatedIntent: 'Send {value} to {to}',
          fields: [
            { path: 'to', label: 'Recipient', format: 'addressName' },
            {
              path: 'value',
              label: 'Amount',
              format: 'tokenAmount',
              params: { tokenPath: '@.to' },
            },
          ],
        },
        'approve(address spender,uint256 value)': {
          intent: 'Approve',
          fields: [
            { path: 'spender', label: 'Spender', format: 'addressName' },
            {
              path: 'value',
              label: 'Amount',
              format: 'tokenAmount',
              params: { tokenPath: '@.to' },
            },
          ],
        },
        'setApprovalForAll(address operator,bool approved)': {
          intent: 'Set approval for all',
          fields: [
            { path: 'operator', label: 'Operator', format: 'addressName' },
            { path: 'approved', label: 'Approved', format: 'raw' },
          ],
        },
      },
    },
  };
}

async function resolved(input: InputDescriptor): Promise<ResolvedDescriptor> {
  const resolved = await resolveDescriptor(input, createMemoryIncludeLoader({}));
  return { ...resolved, source: 'official-registry' };
}

function registryFrom(entries: ResolvedDescriptor[]): DecodeRegistry {
  return {
    async findCalldata(key) {
      const want = key.address.toLowerCase();
      return (
        entries.find((entry) =>
          entry.deployments.some(
            (d) => d.chainId === key.chainId && d.address.toLowerCase() === want
          )
        ) ?? null
      );
    },
  };
}

describe('nested Multicall3 / Safe', () => {
  it('expands aggregate3 wrapping two ERC-20 transfers into children', async () => {
    const usdc = await resolved(tokenDescriptor(USDC, 'USDC', 6));
    const usdt = await resolved(tokenDescriptor(USDT, 'USDT', 6));
    const transferUsdc = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 100_000000n],
    });
    const transferUsdt = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 50_000000n],
    });
    const data = encodeFunctionData({
      abi: multicallAbi,
      functionName: 'aggregate3',
      args: [
        [
          { target: USDC, allowFailure: false, callData: transferUsdc },
          { target: USDT, allowFailure: false, callData: transferUsdt },
        ],
      ],
    });

    const result = await decodeTransaction(
      { chainId: 1, to: MULTICALL3, data },
      { registry: registryFrom([usdc, usdt]), trust: officialOrLocalPolicy() }
    );

    expect(result.children).toHaveLength(2);
    expect(result.children?.[0].source).toBe('official-registry');
    expect(result.children?.[1].source).toBe('official-registry');
    expect(result.children?.[0].fields.some((f) => f.format === 'tokenAmount')).toBe(true);
    expect(result.children?.[1].fields.some((f) => f.format === 'tokenAmount')).toBe(true);
    expect(result.children?.[0].confidence).toBe('high');
    expect(result.children?.[1].confidence).toBe('high');
    expect(result.intent).toContain(' and ');
    // Parent Multicall3 has no descriptor → basic/low; children stay high.
    expect(result.confidence).toBe('low');
  });

  it('marks a child without a descriptor as basic', async () => {
    const usdc = await resolved(tokenDescriptor(USDC, 'USDC', 6));
    const transferUsdc = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 1n],
    });
    const unknownCall = '0xdeadbeef' as Hex;
    const data = encodeFunctionData({
      abi: multicallAbi,
      functionName: 'aggregate3',
      args: [
        [
          { target: USDC, allowFailure: false, callData: transferUsdc },
          { target: SPENDER, allowFailure: false, callData: unknownCall },
        ],
      ],
    });

    const result = await decodeTransaction(
      { chainId: 1, to: MULTICALL3, data },
      { registry: registryFrom([usdc]), trust: officialOrLocalPolicy() }
    );

    expect(result.children).toHaveLength(2);
    expect(result.children?.[0].source).toBe('official-registry');
    expect(result.children?.[1].source).toBe('basic');
    expect(result.confidence).toBe('low');
  });

  it('expands Safe execTransaction CALL into one child', async () => {
    const usdc = await resolved(tokenDescriptor(USDC, 'USDC', 6));
    const transferUsdc = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 100_000000n],
    });
    const data = encodeFunctionData({
      abi: safeAbi,
      functionName: 'execTransaction',
      args: [
        USDC,
        0n,
        transferUsdc,
        0,
        0n,
        0n,
        0n,
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
        '0x',
      ],
    });

    const result = await decodeTransaction(
      { chainId: 1, to: SAFE, data },
      { registry: registryFrom([usdc]), trust: officialOrLocalPolicy() }
    );

    expect(result.children).toHaveLength(1);
    expect(result.children?.[0].source).toBe('official-registry');
    expect(result.children?.[0].metadata.contractAddress?.toLowerCase()).toBe(USDC.toLowerCase());
  });

  it('does not expand Safe DELEGATECALL', async () => {
    const usdc = await resolved(tokenDescriptor(USDC, 'USDC', 6));
    const transferUsdc = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 1n],
    });
    const data = encodeFunctionData({
      abi: safeAbi,
      functionName: 'execTransaction',
      args: [
        USDC,
        0n,
        transferUsdc,
        1,
        0n,
        0n,
        0n,
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
        '0x',
      ],
    });

    const result = await decodeTransaction(
      { chainId: 1, to: SAFE, data },
      { registry: registryFrom([usdc]), trust: officialOrLocalPolicy() }
    );

    expect(result.children).toBeUndefined();
  });
});

describe('format compat + spender allowlist', () => {
  it('format() returns intent and interpolatedIntent on an official fixture', async () => {
    const usdc = await resolved(tokenDescriptor(USDC, 'USDC', 6));
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 100_000000n],
    });
    const result = await format({ chainId: 1, to: USDC, data }, { registry: registryFrom([usdc]) });
    expect(result.intent).toMatch(/Send/);
    expect(result.interpolatedIntent).toBeDefined();
    expect(result.trust.policy).toBe('official-or-local');
  });

  it('spenderAllowlist suppresses untrusted_spender for setApprovalForAll', async () => {
    const usdc = await resolved(tokenDescriptor(USDC, 'USDC', 6));
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'setApprovalForAll',
      args: [SPENDER, true],
    });

    const warned = await decodeTransaction(
      { chainId: 1, to: USDC, data },
      { registry: registryFrom([usdc]), trust: officialOrLocalPolicy() }
    );
    expect(warned.warnings.some((w) => w.type === 'untrusted_spender')).toBe(true);

    const allowed = await decodeTransaction(
      { chainId: 1, to: USDC, data },
      {
        registry: registryFrom([usdc]),
        trust: officialOrLocalPolicy(),
        spenderAllowlist: [SPENDER],
      }
    );
    expect(allowed.warnings.some((w) => w.type === 'untrusted_spender')).toBe(false);
  });

  it('locale does not translate descriptor intent strings', async () => {
    const descriptor: InputDescriptor = {
      ...tokenDescriptor(USDC, 'USDC', 6),
      display: {
        formats: {
          'transfer(address to,uint256 value)': {
            intent: { en: 'Send', es: 'Enviar' },
            fields: [{ path: 'to', label: 'Recipient', format: 'addressName' }],
          },
        },
      },
    };
    const resolvedDesc = await resolved(descriptor);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 1n],
    });
    const result = await decodeTransaction(
      { chainId: 1, to: USDC, data },
      { registry: registryFrom([resolvedDesc]), locale: 'es', trust: officialOrLocalPolicy() }
    );
    expect(result.intent).toBe('Send');
  });
});
