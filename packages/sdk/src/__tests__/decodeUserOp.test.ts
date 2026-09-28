import { encodeFunctionData, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';
import { decodeUserOp } from '../decode/decodeUserOp.js';
import type { DecodeRegistry } from '../decode/types.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import { officialOrLocalPolicy } from '../trust/policy.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const SENDER = '0x2222222222222222222222222222222222222222' as const;
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as const;

const simpleAccountAbi = parseAbi([
  'function execute(address dest, uint256 value, bytes func)',
  'function executeBatch(address[] dest, uint256[] value, bytes[] func)',
]);
const erc20Abi = parseAbi(['function transfer(address to, uint256 value)']);

const usdcDescriptor: InputDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    $id: 'USDC',
    contract: {
      deployments: [{ chainId: 1, address: USDC }],
    },
  },
  metadata: {
    owner: 'Centre',
    contractName: 'USD Coin',
    info: { url: 'https://www.circle.com/', deploymentDate: '2018-09-15T00:00:00Z' },
    token: { name: 'USD Coin', ticker: 'USDC', decimals: 6 },
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
    },
  },
};

async function registry(): Promise<DecodeRegistry> {
  const resolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
  const tagged: ResolvedDescriptor = { ...resolved, source: 'official-registry' };
  return {
    async findCalldata(key) {
      if (key.address.toLowerCase() === USDC.toLowerCase()) {
        return tagged;
      }
      return null;
    },
  };
}

describe('decodeUserOp — Simple Account only', () => {
  it('execute UserOp yields one child for the inner target', async () => {
    const transfer = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 100_000000n],
    });
    const callData = encodeFunctionData({
      abi: simpleAccountAbi,
      functionName: 'execute',
      args: [USDC, 0n, transfer],
    });

    const result = await decodeUserOp(
      { chainId: 1, sender: SENDER, callData },
      { registry: await registry(), trust: officialOrLocalPolicy() }
    );

    expect(result.children).toHaveLength(1);
    expect(result.children?.[0].source).toBe('official-registry');
    expect(result.children?.[0].metadata.contractAddress?.toLowerCase()).toBe(USDC.toLowerCase());
    expect(result.source).toBe('official-registry');
    expect(result.confidence).toBe('high');
    expect(result.metadata.contractAddress?.toLowerCase()).toBe(SENDER.toLowerCase());
    expect(result.intent).toMatch(/Send/);
  });

  it('executeBatch yields one child per target', async () => {
    const transfer = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [VITALIK, 1n],
    });
    const callData = encodeFunctionData({
      abi: simpleAccountAbi,
      functionName: 'executeBatch',
      args: [
        [USDC, USDC],
        [0n, 0n],
        [transfer, transfer],
      ],
    });

    const result = await decodeUserOp(
      { chainId: 1, sender: SENDER, callData },
      { registry: await registry(), trust: officialOrLocalPolicy() }
    );

    expect(result.children).toHaveLength(2);
    expect(result.intent).toContain(' and ');
  });

  it('non-Simple-Account callData stays basic (other 4337 factories out of scope)', async () => {
    const result = await decodeUserOp(
      { chainId: 1, sender: SENDER, callData: '0xdeadbeef' },
      { registry: await registry(), trust: officialOrLocalPolicy() }
    );
    expect(result.source).toBe('basic');
    expect(result.children).toBeUndefined();
  });
});
