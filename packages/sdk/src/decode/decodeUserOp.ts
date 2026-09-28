import type { Hex } from '../types/descriptor.js';
import { asAddress, stubTrust } from './common.js';
import {
  SIMPLE_ACCOUNT_EXECUTE,
  SIMPLE_ACCOUNT_EXECUTE_BATCH,
  attachChildren,
  decodeInnerCalls,
  extractUserOpCalls,
  joinSentences,
  mergeTrust,
  minConfidence,
} from './innerCalls.js';
import type { Address, DecodeOptions, DecodedOperation } from './types.js';

export interface UserOpInput {
  chainId: number;
  sender: Address;
  callData: Hex;
  nonce?: bigint;
}

/**
 * Decode an ERC-4337 UserOperation for eth-infinitism Simple Account only.
 *
 * - `execute(dest, value, data)` → one child; root mirrors the child's
 *   source / confidence / trust / intent (inner contract, not EntryPoint).
 * - `executeBatch` → N children; root joins intents with `" and "`.
 *
 * Other account factories are out of scope.
 */
export async function decodeUserOp(
  op: UserOpInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  const sender = asAddress(op.sender);
  const calls = extractUserOpCalls(op.callData);
  const selector = op.callData.slice(0, 10).toLowerCase() as Hex;

  if (!calls || calls.length === 0) {
    return {
      confidence: 'low',
      source: 'basic',
      intent: 'Unknown account operation',
      fields: [],
      excluded: [],
      warnings: [
        {
          type: 'missing_metadata',
          severity: 'medium',
          message:
            'UserOp callData is not a Simple Account execute / executeBatch (other 4337 accounts are out of scope)',
        },
      ],
      trust: stubTrust('basic'),
      metadata: {
        chainId: op.chainId,
        contractAddress: sender,
      },
      raw: {
        selector: selector.length === 10 ? selector : undefined,
      },
    };
  }

  const children = await decodeInnerCalls(calls, { chainId: op.chainId, from: sender }, options);

  const isSingleExecute = selector === SIMPLE_ACCOUNT_EXECUTE && children.length === 1;
  const joined = joinSentences(children);
  const base: DecodedOperation = {
    confidence: minConfidence(children.map((child) => child.confidence)),
    source: isSingleExecute ? children[0].source : 'basic',
    intent: joined ?? (isSingleExecute ? children[0].intent : 'Batch'),
    interpolatedIntent: joined,
    functionName:
      selector === SIMPLE_ACCOUNT_EXECUTE
        ? 'execute'
        : selector === SIMPLE_ACCOUNT_EXECUTE_BATCH
          ? 'executeBatch'
          : undefined,
    signature:
      selector === SIMPLE_ACCOUNT_EXECUTE
        ? 'execute(address,uint256,bytes)'
        : selector === SIMPLE_ACCOUNT_EXECUTE_BATCH
          ? 'executeBatch(address[],uint256[],bytes[])'
          : undefined,
    selector: selector.length === 10 ? selector : undefined,
    fields: [],
    excluded: [],
    warnings: [],
    trust: isSingleExecute ? children[0].trust : mergeTrust(children),
    metadata: {
      chainId: op.chainId,
      contractAddress: sender,
    },
    raw: {
      selector: selector.length === 10 ? selector : undefined,
    },
  };

  return attachChildren(base, children);
}
