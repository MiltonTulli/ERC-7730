/**
 * Sourcify API integration for fetching verified contract ABIs
 *
 * Sourcify is a decentralized smart contract verification service
 * that can provide ABIs for verified contracts.
 */

import type { ABI } from '../generate/generate.js';

const SOURCIFY_API_V2_BASE = 'https://sourcify.dev/server';

export interface SourcifyMatch {
  match: 'exact_match' | 'match' | null;
  chainId: string;
  address: string;
  verifiedAt?: string;
}

/**
 * Response from Sourcify API v2 when requesting specific fields
 */
export interface SourcifyContractDetails {
  // Base fields (always returned)
  matchId?: string;
  creationMatch?: string;
  runtimeMatch?: string;
  verifiedAt?: string;
  match?: 'exact_match' | 'match' | null;
  chainId?: string;
  address?: string;

  // Optional field: ABI
  abi?: ABI;

  // Optional field: sources (contains contract name in keys)
  sources?: Record<string, { content: string }>;
}

export interface SourcifyResult {
  verified: boolean;
  abi: ABI | null;
  name: string | null;
  match: 'exact_match' | 'match' | null;
}

/**
 * Fetch contract ABI from Sourcify
 *
 * @param chainId - The chain ID
 * @param address - The contract address
 * @returns Contract details including ABI if verified
 */
export async function fetchFromSourcify(chainId: number, address: string): Promise<SourcifyResult> {
  try {
    // Only request the 'abi' field - 'name' is not a valid field in Sourcify API v2
    const url = `${SOURCIFY_API_V2_BASE}/v2/contract/${chainId}/${address}?fields=abi`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          verified: false,
          abi: null,
          name: null,
          match: null,
        };
      }
      throw new Error(`Sourcify API error: ${response.statusText}`);
    }

    const data: SourcifyContractDetails = await response.json();

    // Extract contract name from ABI if available (look for contract name pattern)
    const contractName = extractContractName(data.abi);

    return {
      verified: !!data.match,
      abi: data.abi || null,
      name: contractName,
      match: data.match ?? null,
    };
  } catch (error) {
    // Network errors or other issues - fail silently
    console.warn('[ERC7730 SDK] Sourcify fetch failed:', (error as Error).message);
    return {
      verified: false,
      abi: null,
      name: null,
      match: null,
    };
  }
}

/**
 * Try to extract a meaningful contract name from the ABI
 * This looks at the function names and events to infer a protocol/contract name
 */
function extractContractName(abi: ABI | undefined): string | null {
  if (!abi || !Array.isArray(abi)) return null;

  // Look for common patterns in function/event names
  const names: string[] = [];
  for (const item of abi) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'name' in item &&
      typeof (item as { name?: unknown }).name === 'string'
    ) {
      names.push((item as { name: string }).name);
    }
  }

  // Try to detect common contract types
  const lowerNames = names.map((n) => n.toLowerCase());

  if (lowerNames.some((n) => ['stake', 'unstake', 'getreward'].includes(n))) {
    return 'Staking Contract';
  }
  if (lowerNames.some((n) => n.includes('swap'))) {
    return 'DEX Contract';
  }
  if (names.includes('transfer') && names.includes('approve') && names.includes('balanceOf')) {
    return 'Token Contract';
  }
  if (names.includes('safeTransferFrom') && names.includes('tokenURI')) {
    return 'NFT Contract';
  }

  return null;
}

/**
 * Check if a contract is verified on Sourcify (quick check without fetching ABI)
 */
export async function isVerifiedOnSourcify(chainId: number, address: string): Promise<boolean> {
  try {
    const url = `${SOURCIFY_API_V2_BASE}/v2/contract/${chainId}/${address}`;
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
