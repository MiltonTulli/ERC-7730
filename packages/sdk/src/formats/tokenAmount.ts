/**
 * Token amount formatter
 * Converts raw uint256 to human-readable amount with symbol
 */

import type { Provider } from '../types';

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
 * Read token symbol and decimals from the provider.
 * This function does not apply a curated token list.
 */
export async function getTokenInfo(
  address: string,
  _chainId: number,
  provider?: Provider | null
): Promise<TokenInfo | null> {
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
