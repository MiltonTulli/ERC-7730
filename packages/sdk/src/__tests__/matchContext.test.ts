import { keccak256, toBytes } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  EIP1967_IMPLEMENTATION_SLOT,
  matchContext,
  resolveImplementation,
} from '../decode/context.js';
import type { InputDescriptor } from '../types/descriptor.js';
import type { Address, Provider } from '../types/index.js';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const SAFE = '0x41675C099F32341bf84BFc5382aF534df5C7461a' as const;
const SAFE_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67' as const;
const CLONE = '0x2222222222222222222222222222222222222222' as const;
const RANDOM = '0x1234567890123456789012345678901234567890' as const;

function padAddress(address: string): `0x${string}` {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}` as `0x${string}`;
}

function topic0(canonical: string): `0x${string}` {
  return keccak256(toBytes(canonical));
}

function storageProvider(impl: string): Provider {
  return {
    async getStorageAt({ slot }) {
      if (slot.toLowerCase() === EIP1967_IMPLEMENTATION_SLOT) {
        return padAddress(impl);
      }
      return `0x${'00'.repeat(32)}`;
    },
  };
}

function codeProvider(impl: string): Provider {
  const prefix = '0x363d3d373d3d3d363d73';
  const suffix = '5af43d82803e903d91602b57fd5bf3';
  const code = `${prefix}${impl.slice(2).toLowerCase()}${suffix}` as `0x${string}`;
  return {
    async getCode() {
      return code;
    },
  };
}

function logsProvider(
  logs: Array<{ address: string; topics: readonly string[]; data: string }>
): Provider {
  return {
    async getLogs() {
      return logs.map((log) => ({
        address: log.address as Address,
        topics: log.topics as readonly `0x${string}`[],
        data: log.data as `0x${string}`,
      }));
    },
  };
}

const usdcDescriptor: InputDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    contract: {
      deployments: [{ chainId: 1, address: USDC }],
    },
  },
  metadata: { owner: 'Centre' },
  display: { formats: { 'transfer(address to,uint256 value)': { intent: 'Send' } } },
};

const factoryDescriptor: InputDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    $id: 'Safe clone',
    contract: {
      factory: {
        deployments: [{ chainId: 1, address: SAFE_FACTORY }],
        deployEvent: 'ProxyCreation(address indexed proxy, address singleton)',
      },
    },
  },
  metadata: { owner: 'Safe{Wallet}', contractName: 'Safe' },
  display: { formats: { 'approveHash(bytes32 hashToApprove)': { intent: 'Approve Safe hash' } } },
};

describe('matchContext deployments', () => {
  it('matches an official-style USDC deployment', async () => {
    const result = await matchContext(usdcDescriptor, {
      to: USDC,
      data: '0xa9059cbb',
      chainId: 1,
    });
    expect(result).toEqual({ matched: true, via: 'deployment' });
  });

  it('rejects the same selector on an address not listed in context', async () => {
    const result = await matchContext(usdcDescriptor, {
      to: RANDOM,
      data: '0xa9059cbb',
      chainId: 1,
    });
    expect(result.matched).toBe(false);
  });
});

describe('matchContext proxy', () => {
  const safeDescriptor: InputDescriptor = {
    $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
    context: {
      $id: 'Safe',
      contract: {
        deployments: [{ chainId: 1, address: SAFE }],
      },
    },
    metadata: { owner: 'Safe{Wallet}', contractName: 'Safe' },
    display: { formats: { 'approveHash(bytes32 hashToApprove)': { intent: 'Approve Safe hash' } } },
  };

  it('matches an EIP-1967 proxy whose implementation is in deployments', async () => {
    const result = await matchContext(
      safeDescriptor,
      { to: CLONE, data: '0xd4d9bdcd', chainId: 1 },
      { provider: storageProvider(SAFE) }
    );
    expect(result).toEqual({ matched: true, via: 'proxy' });
  });

  it('matches an EIP-1167 minimal proxy', async () => {
    const result = await matchContext(
      safeDescriptor,
      { to: CLONE, data: '0xd4d9bdcd', chainId: 1 },
      { provider: codeProvider(SAFE) }
    );
    expect(result).toEqual({ matched: true, via: 'proxy' });
    expect(await resolveImplementation(CLONE, codeProvider(SAFE))).toBe(SAFE.toLowerCase());
  });

  it('does not treat a zero implementation slot as a proxy', async () => {
    const result = await matchContext(
      safeDescriptor,
      { to: CLONE, data: '0xd4d9bdcd', chainId: 1 },
      { provider: storageProvider('0x0000000000000000000000000000000000000000') }
    );
    expect(result.matched).toBe(false);
  });
});

describe('matchContext factory', () => {
  const indexedTopic = topic0('ProxyCreation(address,address)');

  it('matches a clone included in the factory deployEvent (indexed address)', async () => {
    const provider = logsProvider([
      {
        address: SAFE_FACTORY,
        topics: [indexedTopic, padAddress(CLONE)],
        data: padAddress(SAFE),
      },
    ]);
    const result = await matchContext(
      factoryDescriptor,
      { to: CLONE, data: '0xd4d9bdcd', chainId: 1 },
      { provider }
    );
    expect(result).toEqual({ matched: true, via: 'factory' });
  });

  it('matches from event data when the address argument is not indexed', async () => {
    const unnamed: InputDescriptor = {
      ...factoryDescriptor,
      context: {
        contract: {
          factory: {
            deployments: [{ chainId: 1, address: SAFE_FACTORY }],
            deployEvent: 'ProxyCreation(address)',
          },
        },
      },
    };
    const provider = logsProvider([
      {
        address: SAFE_FACTORY,
        topics: [topic0('ProxyCreation(address)')],
        data: padAddress(CLONE),
      },
    ]);
    const result = await matchContext(
      unnamed,
      { to: CLONE, data: '0xd4d9bdcd', chainId: 1 },
      { provider }
    );
    expect(result).toEqual({ matched: true, via: 'factory' });
  });

  it('rejects a log whose emitter is not a listed factory', async () => {
    const provider = logsProvider([
      {
        address: RANDOM,
        topics: [indexedTopic, padAddress(CLONE)],
        data: padAddress(SAFE),
      },
    ]);
    const result = await matchContext(
      factoryDescriptor,
      { to: CLONE, data: '0xd4d9bdcd', chainId: 1 },
      { provider }
    );
    expect(result.matched).toBe(false);
  });

  it('fails closed without getLogs', async () => {
    const result = await matchContext(
      factoryDescriptor,
      { to: CLONE, data: '0xd4d9bdcd', chainId: 1 },
      { provider: null }
    );
    expect(result.matched).toBe(false);
  });
});

describe('matchContext eip712', () => {
  const permit: InputDescriptor = {
    $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
    context: {
      eip712: {
        deployments: [{ chainId: 1, address: USDC }],
        domain: { name: 'USD Coin', version: '2' },
      },
    },
    metadata: { owner: 'USDC' },
    display: {
      formats: {
        'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)': {
          intent: 'Authorize spending of tokens',
        },
      },
    },
  };

  const payload = {
    chainId: 1,
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: 1,
      verifyingContract: USDC,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: {},
  };

  it('matches domain + deployments', async () => {
    const result = await matchContext(permit, payload);
    expect(result).toEqual({ matched: true, via: 'eip712' });
  });

  it('rejects a domain name mismatch', async () => {
    const result = await matchContext(permit, {
      ...payload,
      domain: { ...payload.domain, name: 'Fake Coin' },
    });
    expect(result.matched).toBe(false);
  });
});
