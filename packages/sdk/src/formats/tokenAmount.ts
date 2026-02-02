/**
 * Token amount formatter
 * Converts raw uint256 to human-readable amount with symbol
 */

import type { Provider } from '../types/index.js';

// Well-known tokens (chainId -> address -> info)
export const KNOWN_TOKENS: Record<number, Record<string, { symbol: string; decimals: number }>> = {
  // Ethereum Mainnet
  1: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
    '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
    '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18 },
    '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18 },
    '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18 },
    '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': { symbol: 'SHIB', decimals: 18 },
    '0x4d224452801aced8b2f0aebe155379bb5d594381': { symbol: 'APE', decimals: 18 },
  },
  // Arbitrum
  42161: {
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', decimals: 6 },
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', decimals: 6 },
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', decimals: 18 },
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { symbol: 'WETH', decimals: 18 },
  },
  // Optimism
  10: {
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { symbol: 'USDC', decimals: 6 },
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { symbol: 'USDT', decimals: 6 },
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', decimals: 18 },
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  },
  // Base
  8453: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  },
  // Polygon
  137: {
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': { symbol: 'USDC.e', decimals: 6 },
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6 },
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', decimals: 6 },
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI', decimals: 18 },
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', decimals: 18 },
  },
};

// Native currency info by chainId
export const NATIVE_CURRENCY: Record<number, { symbol: string; decimals: number }> = {
  1: { symbol: 'ETH', decimals: 18 },
  10: { symbol: 'ETH', decimals: 18 },
  137: { symbol: 'MATIC', decimals: 18 },
  8453: { symbol: 'ETH', decimals: 18 },
  42161: { symbol: 'ETH', decimals: 18 },
  43114: { symbol: 'AVAX', decimals: 18 },
  56: { symbol: 'BNB', decimals: 18 },
};

const INFINITE_THRESHOLD = 2n ** 255n;

export interface TokenInfo {
  symbol: string;
  decimals: number;
}

/**
 * Get token info from cache or on-chain
 */
export async function getTokenInfo(
  address: string,
  chainId: number,
  provider?: Provider | null
): Promise<TokenInfo | null> {
  const normalized = address.toLowerCase();

  // Check cache first
  const cached = KNOWN_TOKENS[chainId]?.[normalized];
  if (cached) {
    return cached;
  }

  // Try to fetch from chain if provider available
  if (provider?.readContract) {
    try {
      const [symbol, decimals] = await Promise.all([
        provider.readContract({
          address: address as `0x${string}`,
          abi: [{ name: 'symbol', type: 'function', inputs: [], outputs: [{ type: 'string' }] }],
          functionName: 'symbol',
        }),
        provider.readContract({
          address: address as `0x${string}`,
          abi: [{ name: 'decimals', type: 'function', inputs: [], outputs: [{ type: 'uint8' }] }],
          functionName: 'decimals',
        }),
      ]);

      return {
        symbol: symbol as string,
        decimals: Number(decimals),
      };
    } catch {
      // Contract might not be ERC20
      return null;
    }
  }

  return null;
}

/**
 * Format raw amount with decimals and symbol
 */
export function formatAmount(
  rawAmount: bigint | string | number,
  decimals: number,
  symbol?: string
): string {
  const amount = BigInt(rawAmount);

  // Check for "infinite" approval
  if (amount >= INFINITE_THRESHOLD) {
    return symbol ? `Unlimited ${symbol}` : 'Unlimited';
  }

  // Format with decimals
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  let formatted: string;

  if (fractionalPart === 0n) {
    formatted = formatWithCommas(integerPart);
  } else {
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    // Remove trailing zeros
    const trimmed = fractionalStr.replace(/0+$/, '');
    // Limit decimal places for readability
    const displayDecimals = Math.min(trimmed.length, 6);
    formatted = `${formatWithCommas(integerPart)}.${trimmed.slice(0, displayDecimals)}`;
  }

  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Add thousand separators to number
 */
function formatWithCommas(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Check if amount represents an "infinite" approval
 */
export function isInfiniteApproval(amount: bigint | string | number): boolean {
  return BigInt(amount) >= INFINITE_THRESHOLD;
}
