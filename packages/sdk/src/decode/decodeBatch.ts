import { InvalidInputError } from '../errors';
import type { TransactionInput } from '../types';
import { decodeTransaction } from './decodeTransaction';
import type { Address, DecodeOptions, DecodedOperation, SecurityWarning } from './types';

export interface BatchInput {
  chainId: number;
  from?: Address;
  calls: TransactionInput[];
}

export interface BatchDecodeResult {
  interpolatedIntent?: string;
  calls: DecodedOperation[];
  /** Child warnings, deduped by `type` and `path`. Always set, possibly empty. */
  warnings: SecurityWarning[];
}

/**
 * Decode an EIP-5792 `wallet_sendCalls` batch. Each call is rendered with
 * `decodeTransaction`. The batch sentence joins per-call sentences with `" and "`.
 */
export async function decodeBatch(
  batch: BatchInput,
  options?: DecodeOptions
): Promise<BatchDecodeResult> {
  if (!Number.isInteger(batch.chainId) || batch.chainId <= 0) {
    throw new InvalidInputError('INVALID_CHAIN_ID', `Invalid chainId: ${String(batch.chainId)}`);
  }
  if (!Array.isArray(batch.calls)) {
    throw new InvalidInputError('INVALID_CALLDATA', 'Batch calls must be an array');
  }
  const calls: DecodedOperation[] = [];
  for (const call of batch.calls) {
    calls.push(
      await decodeTransaction(
        {
          ...call,
          chainId: call.chainId ?? batch.chainId,
          from: call.from ?? batch.from,
        },
        options
      )
    );
  }

  const sentences = calls
    .map((call) => call.interpolatedIntent ?? call.intent)
    .filter((sentence): sentence is string => typeof sentence === 'string' && sentence.length > 0);

  return {
    interpolatedIntent: sentences.length > 0 ? sentences.join(' and ') : undefined,
    calls,
    warnings: dedupedChildWarnings(calls),
  };
}

function dedupedChildWarnings(calls: DecodedOperation[]): SecurityWarning[] {
  const seen = new Set<string>();
  const warnings: SecurityWarning[] = [];
  for (const call of calls) {
    for (const warning of call.warnings) {
      const key = `${warning.type}\0${warning.path ?? ''}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      warnings.push(warning);
    }
  }
  return warnings;
}
