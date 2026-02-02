/**
 * Address name resolver
 * Resolves addresses to human-readable names (ENS, known contracts, etc.)
 */

import type { Provider } from '../types/index.js';

// Well-known contract addresses (chainId -> address -> name)
export const KNOWN_ADDRESSES: Record<number, Record<string, string>> = {
  // Ethereum Mainnet
  1: {
    // Tokens
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
    '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',

    // Uniswap
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router',
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router (Old)',
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router',
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',

    // Aave
    '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave V3 Pool',
    '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9': 'Aave V2 Pool',

    // Other DeFi
    '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch Router V5',
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
    '0x881d40237659c251811cec9c364ef91dc08d300c': 'MetaMask Swap Router',

    // NFT
    '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': 'OpenSea Seaport',
    '0x00000000006c3852cbef3e08e8df289169ede581': 'OpenSea Seaport 1.1',

    // ENS
    '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85': 'ENS Registrar',
    '0x253553366da8546fc250f225fe3d25d0c782303b': 'ENS ETH Registrar Controller',

    // Gnosis Safe
    '0xd9db270c1b5e3bd161e8c8503c55ceabee709552': 'Gnosis Safe Singleton',
    '0xa6b71e26c5e0845f74c812102ca7114b6a896ab2': 'Gnosis Safe Proxy Factory',
  },

  // Arbitrum
  42161: {
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router 2',
    '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch Router V5',
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'Aave V3 Pool',
  },

  // Optimism
  10: {
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router 2',
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'Aave V3 Pool',
  },

  // Base
  8453: {
    '0x2626664c2603336e57b271c5c0b26f421741e481': 'Uniswap V3 Router',
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
  },

  // Polygon
  137: {
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router 2',
    '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch Router V5',
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'Aave V3 Pool',
  },
};

// Null address variations
const NULL_ADDRESSES = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000001',
  '0x000000000000000000000000000000000000dead',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // Often used for native ETH
]);

export interface ResolvedAddress {
  address: string;
  name: string | null;
  type: 'ens' | 'known' | 'null' | 'raw';
}

/**
 * Resolve address to human-readable name
 */
export async function resolveAddress(
  address: string,
  chainId: number,
  provider?: Provider | null
): Promise<ResolvedAddress> {
  const normalized = address.toLowerCase();

  // Check for null/burn addresses
  if (NULL_ADDRESSES.has(normalized)) {
    if (normalized === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return { address, name: 'Native Token', type: 'null' };
    }
    if (normalized === '0x000000000000000000000000000000000000dead') {
      return { address, name: 'Burn Address', type: 'null' };
    }
    return { address, name: 'Null Address', type: 'null' };
  }

  // Check known addresses
  const knownName = KNOWN_ADDRESSES[chainId]?.[normalized];
  if (knownName) {
    return { address, name: knownName, type: 'known' };
  }

  // Try ENS reverse resolution (mainnet only, or L2s with ENS support)
  if (provider?.getEnsName && [1, 10, 8453, 42161].includes(chainId)) {
    try {
      const ensName = await provider.getEnsName({ address: address as `0x${string}` });
      if (ensName) {
        return { address, name: ensName, type: 'ens' };
      }
    } catch {
      // ENS resolution failed, continue
    }
  }

  return { address, name: null, type: 'raw' };
}

/**
 * Format address for display
 */
export function formatAddress(address: string, name?: string | null): string {
  if (name) {
    return name;
  }
  // Truncate: 0x1234...5678
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Check if address is a contract (requires provider)
 */
export async function isContract(
  _address: string,
  _provider?: Provider | null
): Promise<boolean | null> {
  // We can't check without a provider that supports getCode
  // This would require extending the Provider interface
  return null;
}
