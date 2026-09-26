import { decodeCalldata } from '../core/decoder.js';
import type { Hex, TransactionInput } from '../types/index.js';
import { asAddress } from './common.js';
import type { Address, Confidence, DecodeOptions, DecodedOperation, TrustReport } from './types.js';

/** Multicall3 `aggregate((address,bytes)[])` */
export const MULTICALL3_AGGREGATE = '0x252dba42' as Hex;
/** Multicall3 `aggregate3((address,bool,bytes)[])` */
export const MULTICALL3_AGGREGATE3 = '0x82ad56cb' as Hex;
/** Safe `execTransaction(...)` */
export const SAFE_EXEC_TRANSACTION = '0x6a761202' as Hex;
/** eth-infinitism Simple Account `execute(address,uint256,bytes)` */
export const SIMPLE_ACCOUNT_EXECUTE = '0xb61d27f6' as Hex;
/** eth-infinitism Simple Account `executeBatch(address[],uint256[],bytes[])` */
export const SIMPLE_ACCOUNT_EXECUTE_BATCH = '0x47e1da2a' as Hex;

const MAX_NESTED_DEPTH = 2;

export interface InnerCall {
  to: Address;
  data: Hex;
  value?: bigint;
}

function asHexData(value: unknown): Hex | undefined {
  if (typeof value !== 'string' || !value.startsWith('0x') || value.length % 2 !== 0) {
    return undefined;
  }
  return value as Hex;
}

function asAddressValue(value: unknown): Address | undefined {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return undefined;
  }
  return asAddress(value);
}

function asBigInt(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^(0x[0-9a-fA-F]+|\d+)$/.test(value)) {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readTupleField(row: unknown, index: number, names: string[]): unknown {
  if (Array.isArray(row)) {
    return row[index];
  }
  if (row && typeof row === 'object') {
    const rec = row as Record<string, unknown>;
    if (index in rec) {
      return rec[String(index)];
    }
    for (const name of names) {
      if (name in rec) {
        return rec[name];
      }
    }
  }
  return undefined;
}

function callFromAggregateRow(row: unknown): InnerCall | undefined {
  const to = asAddressValue(readTupleField(row, 0, ['target', 'to']));
  const data = asHexData(readTupleField(row, 1, ['callData', 'data']));
  if (!to || !data) {
    return undefined;
  }
  return { to, data };
}

function callFromAggregate3Row(row: unknown): InnerCall | undefined {
  const to = asAddressValue(readTupleField(row, 0, ['target', 'to']));
  const data = asHexData(readTupleField(row, 2, ['callData', 'data']));
  if (!to || !data) {
    return undefined;
  }
  return { to, data };
}

/**
 * Pull inner targets from Multicall3 / Safe CALL when `raw.args` is present.
 * DELEGATECALL (`operation !== 0`) returns an empty list.
 */
export function extractNestedCalls(operation: DecodedOperation): InnerCall[] | null {
  const selector = operation.selector?.toLowerCase();
  const args = operation.raw.args;
  if (!selector || !args || args.length === 0) {
    return null;
  }

  if (selector === MULTICALL3_AGGREGATE) {
    const rows = args[0];
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map(callFromAggregateRow).filter((call): call is InnerCall => Boolean(call));
  }

  if (selector === MULTICALL3_AGGREGATE3) {
    const rows = args[0];
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map(callFromAggregate3Row).filter((call): call is InnerCall => Boolean(call));
  }

  if (selector === SAFE_EXEC_TRANSACTION) {
    const operationType = asBigInt(args[3]) ?? 0n;
    if (operationType !== 0n) {
      return [];
    }
    const to = asAddressValue(args[0]);
    const value = asBigInt(args[1]);
    const data = asHexData(args[2]) ?? ('0x' as Hex);
    if (!to) {
      return [];
    }
    return [{ to, data, value }];
  }

  return null;
}

/**
 * Pull Simple Account `execute` / `executeBatch` targets from account `callData`.
 */
export function extractUserOpCalls(callData: Hex): InnerCall[] | null {
  if (!callData || callData.length < 10) {
    return null;
  }
  const selector = callData.slice(0, 10).toLowerCase() as Hex;
  const decoded = decodeCalldata({
    to: '0x0000000000000000000000000000000000000001',
    data: callData,
    chainId: 1,
  });
  const args = decoded.args;
  if (!args || args.length === 0) {
    return null;
  }

  if (selector === SIMPLE_ACCOUNT_EXECUTE) {
    const to = asAddressValue(args[0]);
    const value = asBigInt(args[1]);
    const data = asHexData(args[2]) ?? ('0x' as Hex);
    if (!to) {
      return null;
    }
    return [{ to, data, value }];
  }

  if (selector === SIMPLE_ACCOUNT_EXECUTE_BATCH) {
    const destinations = args[0];
    const values = args[1];
    const datas = args[2];
    if (!Array.isArray(destinations) || !Array.isArray(datas)) {
      return null;
    }
    const out: InnerCall[] = [];
    for (let i = 0; i < destinations.length; i++) {
      const to = asAddressValue(destinations[i]);
      const data = asHexData(datas[i]) ?? ('0x' as Hex);
      const value = Array.isArray(values) ? asBigInt(values[i]) : undefined;
      if (!to) {
        continue;
      }
      out.push({ to, data, value });
    }
    return out;
  }

  return null;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function minConfidence(values: Confidence[]): Confidence {
  let next: Confidence = 'high';
  for (const value of values) {
    if (CONFIDENCE_RANK[value] < CONFIDENCE_RANK[next]) {
      next = value;
    }
  }
  return values.length === 0 ? 'low' : next;
}

function joinSentences(children: DecodedOperation[]): string | undefined {
  const sentences = children
    .map((child) => child.interpolatedIntent ?? child.intent)
    .filter((sentence): sentence is string => typeof sentence === 'string' && sentence.length > 0);
  return sentences.length > 0 ? sentences.join(' and ') : undefined;
}

function mergeTrust(children: DecodedOperation[]): TrustReport {
  const accepted = children.length > 0 && children.every((child) => child.trust.accepted);
  const reasons = children.flatMap((child) => child.trust.reasons);
  const attesters = Array.from(
    new Set(children.flatMap((child) => child.trust.attesters ?? []).map((a) => a.toLowerCase()))
  ) as Address[];
  const policy =
    children.length === 1
      ? children[0].trust.policy
      : children.map((child) => child.trust.policy).join('+') || 'nested';
  return {
    accepted,
    policy,
    reasons: reasons.length > 0 ? reasons : accepted ? [] : ['untrusted_descriptor'],
    attesters: attesters.length > 0 ? attesters : undefined,
    descriptorHash: children.length === 1 ? children[0].trust.descriptorHash : undefined,
  };
}

export function attachChildren(
  parent: DecodedOperation,
  children: DecodedOperation[]
): DecodedOperation {
  if (children.length === 0) {
    return parent;
  }
  const joined = joinSentences(children);
  const confidence = minConfidence([
    parent.confidence,
    ...children.map((child) => child.confidence),
  ]);
  return {
    ...parent,
    children,
    confidence,
    intent: joined ?? parent.intent,
    interpolatedIntent: joined ?? parent.interpolatedIntent,
  };
}

export async function decodeInnerCalls(
  calls: InnerCall[],
  outer: { chainId: number; from?: Address },
  options: DecodeOptions | undefined
): Promise<DecodedOperation[]> {
  // Dynamic import breaks the decodeTransaction ↔ innerCalls cycle.
  const { decodeTransaction } = await import('./decodeTransaction.js');
  const depth = options?.nestedDepth ?? 0;
  const childOptions: DecodeOptions = {
    ...options,
    nestedDepth: depth + 1,
  };
  const children: DecodedOperation[] = [];
  for (const call of calls) {
    children.push(
      await decodeTransaction(
        {
          chainId: outer.chainId,
          from: outer.from,
          to: call.to,
          data: call.data,
          value: call.value,
        },
        childOptions
      )
    );
  }
  return children;
}

/**
 * Expand Multicall3 / Safe CALL into `children` when nested depth allows.
 */
export async function expandNestedCalls(
  operation: DecodedOperation,
  tx: TransactionInput,
  options: DecodeOptions | undefined
): Promise<DecodedOperation> {
  const depth = options?.nestedDepth ?? 0;
  if (depth >= MAX_NESTED_DEPTH) {
    return operation;
  }
  const calls = extractNestedCalls(operation);
  if (!calls || calls.length === 0) {
    return operation;
  }
  const children = await decodeInnerCalls(
    calls,
    { chainId: tx.chainId, from: asAddress(tx.from ?? tx.to) },
    options
  );
  return attachChildren(operation, children);
}

export { mergeTrust, joinSentences, minConfidence };
