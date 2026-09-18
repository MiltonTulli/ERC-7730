/**
 * Core calldata decoder
 */

import { type Hex, decodeAbiParameters, parseAbiParameters } from 'viem';
import type { TransactionInput } from '../types/index.js';
import { getSignatureBySelector, parseSignature } from './signatures.js';

export interface RawDecodedTransaction {
  selector: string;
  signature: string | null;
  functionName: string | null;
  args: unknown[];
  inputTypes: string[];
}

/**
 * Extract function selector from calldata
 */
export function extractSelector(data: string): string {
  if (!data || data.length < 10) {
    throw new Error('Invalid calldata: too short');
  }
  return data.slice(0, 10).toLowerCase();
}

function toHex(data: string): Hex {
  return (data.startsWith('0x') ? data : `0x${data}`) as Hex;
}

function isAddressString(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Keep the historical decodeParameters contract: lowercase addresses and
 * bigint integers (viem uses checksums and JS numbers for small ints).
 */
function normalizeDecoded(value: unknown): unknown {
  if (typeof value === 'string') {
    return isAddressString(value) ? value.toLowerCase() : value;
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeDecoded);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = normalizeDecoded(inner);
    }
    return out;
  }
  return value;
}

/**
 * Decode ABI-encoded parameters.
 */
export function decodeParameters(types: string[], data: string): unknown[] {
  if (types.length === 0) {
    return [];
  }
  const params = parseAbiParameters(types.join(','));
  const decoded = decodeAbiParameters(params, toHex(data));
  return decoded.map(normalizeDecoded);
}

/**
 * Decode raw transaction calldata
 */
export function decodeCalldata(tx: TransactionInput): RawDecodedTransaction {
  const { data } = tx;

  if (!data || data === '0x') {
    return {
      selector: '0x',
      signature: null,
      functionName: null,
      args: [],
      inputTypes: [],
    };
  }

  const selector = extractSelector(data);
  const sig = getSignatureBySelector(selector);

  if (!sig) {
    // Unknown function - return raw
    return {
      selector,
      signature: null,
      functionName: null,
      args: [data.slice(10)], // Raw params
      inputTypes: ['bytes'],
    };
  }

  const { name, inputs } = parseSignature(sig.signature);
  const paramsData = data.slice(10);

  let args: unknown[] = [];
  try {
    args = decodeParameters(inputs, paramsData);
  } catch {
    // Fallback to raw if decoding fails
    args = [paramsData];
  }

  return {
    selector,
    signature: sig.signature,
    functionName: name,
    args,
    inputTypes: inputs,
  };
}
