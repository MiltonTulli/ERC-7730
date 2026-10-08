import type { TransactionInput, TypedDataInput } from '../types';
import { decodeTransaction } from './decodeTransaction';
import { decodeTypedData } from './decodeTypedData';
import type { DecodeOptions, DecodedOperation } from './types';

/**
 * @deprecated Use {@link decodeTransaction}. Same default trust policy
 * (`officialOnlyPolicy()` when `trust` is omitted).
 * `DecodedOperation` remains the source of truth (not Sourcify's DisplayModel).
 */
export async function format(
  tx: TransactionInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  return decodeTransaction(tx, options);
}

/**
 * @deprecated Use {@link decodeTypedData}. Same default trust policy
 * (`officialOnlyPolicy()` when `trust` is omitted).
 */
export async function formatTypedData(
  data: TypedDataInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  return decodeTypedData(data, options);
}
