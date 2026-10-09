/**
 * Sourcify API integration for fetching verified contract ABIs
 *
 * Sourcify is a decentralized smart contract verification service
 * that can provide ABIs for verified contracts.
 */

import type { VerifiedAbiLoader } from '../decode/abiLoader';
import { type ABI, asInputDescriptor, generateDescriptor } from '../generate/generate';

const DEFAULT_SOURCIFY_BASE = 'https://sourcify.dev/server';

/** Inject the HTTP client and the Sourcify server prefix. */
export interface SourcifyClientOptions {
  fetch?: typeof fetch;
  /** API prefix. Default `https://sourcify.dev/server`. */
  baseUrl?: string;
}

/** Drop a trailing slash run. A quantified regex here is a CodeQL polynomial-ReDoS finding. */
function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

function sourcifyClient(options?: SourcifyClientOptions): {
  fetch: typeof fetch;
  baseUrl: string;
} {
  const raw = options?.baseUrl ?? DEFAULT_SOURCIFY_BASE;
  return {
    fetch: options?.fetch ?? globalThis.fetch.bind(globalThis),
    baseUrl: withoutTrailingSlashes(raw),
  };
}
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isSourcifyTarget(chainId: number, address: string): boolean {
  return Number.isInteger(chainId) && chainId >= 0 && ADDRESS_RE.test(address);
}

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
export async function fetchFromSourcify(
  chainId: number,
  address: string,
  options?: SourcifyClientOptions
): Promise<SourcifyResult> {
  if (!isSourcifyTarget(chainId, address)) {
    return { verified: false, abi: null, name: null, match: null };
  }
  const client = sourcifyClient(options);
  try {
    // Only request the 'abi' field - 'name' is not a valid field in Sourcify API v2
    const url = `${client.baseUrl}/v2/contract/${chainId}/${address}?fields=abi`;

    const response = await client.fetch(url);

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
 * Verified-ABI loader for `DecodeOptions.loadVerifiedAbi`.
 * Call it: `loadVerifiedAbi: sourcifyVerifiedAbiLoader({ fetch, baseUrl })`.
 * The loader attaches a draft descriptor so the decode core does not author one.
 * Importing `@erc7730/sdk` does not install a loader.
 */
export function sourcifyVerifiedAbiLoader(options?: SourcifyClientOptions): VerifiedAbiLoader {
  return async (chainId, address) => {
    const result = await fetchFromSourcify(chainId, address, options);
    if (!result.verified || !result.abi) {
      return null;
    }
    return {
      abi: result.abi,
      name: result.name || undefined,
      descriptor: asInputDescriptor(
        generateDescriptor({
          chainId,
          address,
          abi: result.abi,
          owner: result.name || undefined,
          contractName: result.name || undefined,
        })
      ),
    };
  };
}

/** Check if a contract is verified on Sourcify (quick check without fetching ABI). */
export async function isVerifiedOnSourcify(
  chainId: number,
  address: string,
  options?: SourcifyClientOptions
): Promise<boolean> {
  if (!isSourcifyTarget(chainId, address)) {
    return false;
  }
  const client = sourcifyClient(options);
  try {
    const url = `${client.baseUrl}/v2/contract/${chainId}/${address}`;
    const response = await client.fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
