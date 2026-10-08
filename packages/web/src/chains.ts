import type { Chain } from 'viem';
import {
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

/** Chains the playground offers. The SDK no longer ships RPC helpers. */
export const PLAYGROUND_CHAINS: readonly Chain[] = [
  mainnet,
  arbitrum,
  optimism,
  base,
  polygon,
  bsc,
  avalanche,
  gnosis,
  zkSync,
  linea,
  scroll,
  sepolia,
];

const CHAIN_EXPORT: Record<number, string> = {
  1: 'mainnet',
  42161: 'arbitrum',
  10: 'optimism',
  8453: 'base',
  137: 'polygon',
  56: 'bsc',
  43114: 'avalanche',
  100: 'gnosis',
  324: 'zkSync',
  59144: 'linea',
  534352: 'scroll',
  11155111: 'sepolia',
};

const EXTRA_RPC: Record<number, string> = {
  1: 'https://eth.llamarpc.com',
  42161: 'https://rpc.ankr.com/arbitrum',
  10: 'https://rpc.ankr.com/optimism',
  8453: 'https://rpc.ankr.com/base',
  137: 'https://polygon-rpc.com',
  56: 'https://rpc.ankr.com/bsc',
};

export function playgroundChain(chainId: number): Chain | undefined {
  return PLAYGROUND_CHAINS.find((chain) => chain.id === chainId);
}

export function playgroundChainExport(chainId: number): string {
  return CHAIN_EXPORT[chainId] ?? 'mainnet';
}

export function playgroundRpc(chainId: number): string | null {
  return EXTRA_RPC[chainId] ?? playgroundChain(chainId)?.rpcUrls.default.http[0] ?? null;
}
