import { type BatchDecodeResult, type BatchInput, decodeBatch } from './decode/decodeBatch';
import { decodeTransaction } from './decode/decodeTransaction';
import { decodeTypedData } from './decode/decodeTypedData';
import { type UserOpInput, decodeUserOp } from './decode/decodeUserOp';
import type { DecodeOptions, DecodedOperation } from './decode/types';
import { createMemoryDescriptorCache } from './official-registry/cache';
import { createOfficialRegistry } from './official-registry/create';
import type { OfficialRegistry } from './official-registry/types';
import { type ClearSignScreens, type ScreenVerification, toScreens } from './screens';
import type { TransactionInput, TypedDataInput } from './types';

export interface ClearSignedOperation extends DecodedOperation {
  screens: ClearSignScreens;
}

export interface ClearSignedBatch extends BatchDecodeResult {
  screens: ClearSignScreens;
}

let defaultRegistry: OfficialRegistry | undefined;

/**
 * Official registry pinned to the vendored commit, created once per process.
 * `clearSign()` with no registry uses this instance.
 */
export function sharedClearSignRegistry(): OfficialRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createOfficialRegistry({ cache: createMemoryDescriptorCache() });
  }
  return defaultRegistry;
}

function isBatch(input: object): input is BatchInput {
  return Array.isArray((input as { calls?: unknown }).calls);
}

function isUserOp(input: object): input is UserOpInput {
  const op = input as { callData?: unknown; sender?: unknown };
  return (
    typeof op.callData === 'string' && op.callData.startsWith('0x') && typeof op.sender === 'string'
  );
}

function isTypedData(input: object): input is TypedDataInput {
  const data = input as { types?: unknown; domain?: unknown };
  return (
    typeof data.types === 'object' &&
    data.types !== null &&
    !Array.isArray(data.types) &&
    typeof data.domain === 'object' &&
    data.domain !== null
  );
}

function worst(current: ScreenVerification, next: ScreenVerification): ScreenVerification {
  const rank: Record<ScreenVerification, number> = { verified: 0, unverified: 1, rejected: 2 };
  return rank[next] > rank[current] ? next : current;
}

function batchScreens(batch: BatchDecodeResult): ClearSignScreens {
  const children = batch.calls.map((call) => toScreens(call));
  let verification: ScreenVerification = children.length > 0 ? 'verified' : 'unverified';
  for (const child of children) {
    verification = worst(verification, child.verification);
  }
  const prefix = 'Unverified: ';
  const base = batch.interpolatedIntent ?? 'Batch';
  const headline =
    verification === 'verified' || base.startsWith(prefix) ? base : `${prefix}${base}`;
  const label =
    verification === 'verified'
      ? 'Verified by ERC-7730 registry'
      : verification === 'rejected'
        ? 'Rejected by trust policy'
        : 'Unverified: ABI inference';
  return {
    headline,
    verification,
    verificationLabel: label,
    primary: [],
    secondary: [],
    risks: [],
    ...(children.length > 0 ? { children } : {}),
  };
}

export type ClearSignInput = TransactionInput | TypedDataInput | BatchInput | UserOpInput;

/**
 * Decode a transaction, typed data, EIP-5792 batch, or Simple Account UserOp.
 *
 * With no options this uses the pinned official registry, `officialOnlyPolicy()`,
 * and the ERC-20 / ERC-721 / WETH builtins.
 */
export async function clearSign(
  input: BatchInput,
  options?: DecodeOptions
): Promise<ClearSignedBatch>;
export async function clearSign(
  input: TransactionInput | TypedDataInput | UserOpInput,
  options?: DecodeOptions
): Promise<ClearSignedOperation>;
export async function clearSign(
  input: ClearSignInput,
  options?: DecodeOptions
): Promise<ClearSignedOperation | ClearSignedBatch> {
  const registry = options?.registry ?? sharedClearSignRegistry();
  const resolved: DecodeOptions = { ...options, registry };
  if (isBatch(input)) {
    options?.onEvent?.({ type: 'decode:start', kind: 'batch' });
    const started = performance.now();
    try {
      const batch = await decodeBatch(input, resolved);
      const screens = batchScreens(batch);
      options?.onEvent?.({
        type: 'decode:end',
        kind: 'batch',
        durationMs: performance.now() - started,
        source: batch.calls[0]?.source ?? 'basic',
        confidence: batch.calls[0]?.confidence ?? 'low',
      });
      return { ...batch, screens };
    } catch (error) {
      options?.onEvent?.({
        type: 'decode:end',
        kind: 'batch',
        durationMs: performance.now() - started,
        source: 'basic',
        confidence: 'low',
      });
      throw error;
    }
  }
  if (isUserOp(input)) {
    const operation = await decodeUserOp(input, resolved);
    return { ...operation, screens: toScreens(operation) };
  }
  if (isTypedData(input)) {
    const operation = await decodeTypedData(input, resolved);
    return { ...operation, screens: toScreens(operation) };
  }
  const operation = await decodeTransaction(input, resolved);
  return { ...operation, screens: toScreens(operation) };
}
