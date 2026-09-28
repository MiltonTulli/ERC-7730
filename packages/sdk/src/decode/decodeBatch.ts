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
  warnings?: SecurityWarning[];
}

/**
 * Decode an EIP-5792 `wallet_sendCalls` batch. Each call is rendered with
 * `decodeTransaction`. The batch sentence joins per-call sentences with `" and "`.
 */
export async function decodeBatch(
  batch: BatchInput,
  options?: DecodeOptions
): Promise<BatchDecodeResult> {
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
  };
}
