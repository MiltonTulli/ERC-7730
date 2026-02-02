/**
 * Default public RPC provider utilities
 * Uses viem's chain definitions which include public RPC URLs
 */

import {
  type Chain,
  arbitrum,
  avalanche,
  base,
  bsc,
  gnosis,
  linea,
  mainnet,
  optimism,
  polygon,
  scroll,
  sepolia,
  zkSync,
} from 'viem/chains';

/**
 * Supported chains with their viem definitions
 */
export const SUPPORTED_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [arbitrum.id]: arbitrum,
  [optimism.id]: optimism,
  [base.id]: base,
  [polygon.id]: polygon,
  [bsc.id]: bsc,
  [avalanche.id]: avalanche,
  [gnosis.id]: gnosis,
  [zkSync.id]: zkSync,
  [linea.id]: linea,
  [scroll.id]: scroll,
  [sepolia.id]: sepolia,
};

/**
 * Additional public RPCs not included in viem's defaults
 * These are used as fallbacks or primary options
 */
export const EXTRA_PUBLIC_RPCS: Record<number, string[]> = {
  1: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth', 'https://1rpc.io/eth'],
  42161: ['https://rpc.ankr.com/arbitrum', 'https://1rpc.io/arb'],
  10: ['https://rpc.ankr.com/optimism', 'https://1rpc.io/op'],
  8453: ['https://rpc.ankr.com/base', 'https://1rpc.io/base'],
  137: ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon', 'https://1rpc.io/matic'],
  56: ['https://rpc.ankr.com/bsc', 'https://1rpc.io/bnb'],
};

/**
 * Get the viem Chain object for a chain ID
 */
export function getChain(chainId: number): Chain | null {
  return SUPPORTED_CHAINS[chainId] || null;
}

/**
 * Get default RPC URL for a chain (from viem's chain definition + extras)
 */
export function getDefaultRpc(chainId: number): string | null {
  // Prefer our extra public RPCs first (they tend to be more reliable/fast)
  if (EXTRA_PUBLIC_RPCS[chainId]?.[0]) {
    return EXTRA_PUBLIC_RPCS[chainId][0];
  }

  // Fallback to viem's default
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) return null;

  return chain.rpcUrls.default?.http?.[0] || null;
}

/**
 * Get all public RPC URLs for a chain
 */
export function getRpcUrls(chainId: number): string[] {
  const rpcs: string[] = [];

  // Add our extra public RPCs first
  if (EXTRA_PUBLIC_RPCS[chainId]) {
    rpcs.push(...EXTRA_PUBLIC_RPCS[chainId]);
  }

  // Add viem's RPCs
  const chain = SUPPORTED_CHAINS[chainId];
  if (chain) {
    if (chain.rpcUrls.default?.http) {
      rpcs.push(...chain.rpcUrls.default.http);
    }
    if (chain.rpcUrls.public?.http) {
      rpcs.push(...chain.rpcUrls.public.http);
    }
  }

  // Remove duplicates
  return [...new Set(rpcs)];
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(SUPPORTED_CHAINS).map(Number);
}

/**
 * Check if a chain is supported
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS;
}

/**
 * Get chain name
 */
export function getChainName(chainId: number): string {
  return SUPPORTED_CHAINS[chainId]?.name || `Chain ${chainId}`;
}

/**
 * Get block explorer URL
 */
export function getBlockExplorer(chainId: number): string | null {
  const chain = SUPPORTED_CHAINS[chainId];
  return chain?.blockExplorers?.default?.url || null;
}

/**
 * Chain name to chain ID mapping
 */
const CHAIN_NAME_TO_ID: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  polygon: 137,
};

/**
 * Convert chain name to chain ID
 */
export function chainNameToId(name: string): number {
  const chainId = CHAIN_NAME_TO_ID[name.toLowerCase()];
  if (!chainId) {
    throw new Error(
      `Unknown chain name: ${name}. Supported: ${Object.keys(CHAIN_NAME_TO_ID).join(', ')}`
    );
  }
  return chainId;
}
