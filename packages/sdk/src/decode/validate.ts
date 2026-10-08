import { InvalidInputError } from '../errors';
import type { TransactionInput, TypedDataInput } from '../types';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;

function assertAddress(value: string, label: string): void {
  if (!ADDRESS_RE.test(value)) {
    throw new InvalidInputError('INVALID_ADDRESS', `Invalid ${label}: ${value}`);
  }
}

function assertHex(value: string): void {
  if (typeof value !== 'string' || !HEX_RE.test(value) || value.length % 2 !== 0) {
    throw new InvalidInputError('INVALID_HEX', `Invalid hex data: ${String(value)}`);
  }
}

/**
 * Empty calldata is a native transfer. A 4-byte selector is a complete call.
 * Anything in between, or a partial ABI word after the selector, is truncated.
 */
function assertCalldata(data: string): void {
  assertHex(data);
  const byteLength = (data.length - 2) / 2;
  const truncated =
    (byteLength > 0 && byteLength < 4) || (byteLength > 4 && (byteLength - 4) % 32 !== 0);
  if (truncated) {
    throw new InvalidInputError('INVALID_CALLDATA', `Truncated calldata: ${data}`);
  }
}

function assertPositiveChainId(chainId: number): void {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new InvalidInputError('INVALID_CHAIN_ID', `Invalid chainId: ${String(chainId)}`);
  }
}

function assertNonNegativeValue(value: TransactionInput['value']): void {
  if (value === undefined) {
    return;
  }
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new InvalidInputError(
        'INVALID_CALLDATA',
        'Transaction value must be a non-negative integer'
      );
    }
    return;
  }
  if (typeof value !== 'string' || !/^(0x[0-9a-fA-F]+|\d+)$/.test(value)) {
    throw new InvalidInputError(
      'INVALID_CALLDATA',
      'Transaction value must be a non-negative integer'
    );
  }
  try {
    if (BigInt(value) < 0n) {
      throw new InvalidInputError(
        'INVALID_CALLDATA',
        'Transaction value must be a non-negative integer'
      );
    }
  } catch (error) {
    if (error instanceof InvalidInputError) {
      throw error;
    }
    throw new InvalidInputError(
      'INVALID_CALLDATA',
      'Transaction value must be a non-negative integer',
      { cause: error }
    );
  }
}

export function validateTransactionInput(tx: TransactionInput): void {
  assertAddress(tx.to, 'address');
  if (tx.from !== undefined) {
    assertAddress(tx.from, 'address');
  }
  assertCalldata(tx.data);
  assertPositiveChainId(tx.chainId);
  assertNonNegativeValue(tx.value);
}

function assertTypedChainId(raw: number | bigint): number {
  const value = typeof raw === 'bigint' ? Number(raw) : raw;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(value)
  ) {
    throw new InvalidInputError('INVALID_CHAIN_ID', `Invalid chainId: ${String(raw)}`);
  }
  return value;
}

export function validateTypedDataInput(data: TypedDataInput): void {
  if (!data || typeof data !== 'object') {
    throw new InvalidInputError('INVALID_TYPED_DATA', 'Typed data must be an object');
  }
  if (typeof data.primaryType !== 'string' || data.primaryType.length === 0) {
    throw new InvalidInputError('INVALID_TYPED_DATA', 'Typed data requires primaryType');
  }
  if (!data.types || typeof data.types !== 'object' || Array.isArray(data.types)) {
    throw new InvalidInputError('INVALID_TYPED_DATA', 'Typed data requires types');
  }
  if (!data.message || typeof data.message !== 'object' || Array.isArray(data.message)) {
    throw new InvalidInputError('INVALID_TYPED_DATA', 'Typed data requires message');
  }
  if (!data.domain || typeof data.domain !== 'object' || Array.isArray(data.domain)) {
    throw new InvalidInputError('INVALID_TYPED_DATA', 'Typed data requires domain');
  }
  if (data.chainId !== undefined) {
    assertTypedChainId(data.chainId);
  }
  if (data.domain.chainId !== undefined) {
    assertTypedChainId(data.domain.chainId);
  }
  if (data.domain.verifyingContract !== undefined) {
    assertAddress(data.domain.verifyingContract, 'address');
  }
}
