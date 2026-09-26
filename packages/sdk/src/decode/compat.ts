import { officialOrLocalPolicy } from '../trust/policy.js';
import type { TransactionInput, TypedDataInput } from '../types/index.js';
import { decodeTransaction } from './decodeTransaction.js';
import { decodeTypedData } from './decodeTypedData.js';
import type { DecodeOptions, DecodedOperation } from './types.js';

function withDefaultPolicy(options?: DecodeOptions): DecodeOptions | undefined {
  if (options?.trust) {
    return options;
  }
  if (!options?.registry) {
    return options;
  }
  return { ...options, trust: officialOrLocalPolicy() };
}

/**
 * Compat alias of {@link decodeTransaction} with a default
 * {@link officialOrLocalPolicy} when a registry is present and no policy is set.
 * `DecodedOperation` remains the source of truth (not Sourcify's DisplayModel).
 */
export async function format(
  tx: TransactionInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  return decodeTransaction(tx, withDefaultPolicy(options));
}

/**
 * Compat alias of {@link decodeTypedData} with a default
 * {@link officialOrLocalPolicy} when a registry is present and no policy is set.
 */
export async function formatTypedData(
  data: TypedDataInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  return decodeTypedData(data, withDefaultPolicy(options));
}
