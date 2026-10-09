/**
 * Address name resolver.
 * Null addresses and ENS only. Curated contract names are not applied here.
 */

import type { Provider } from '../types';

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
