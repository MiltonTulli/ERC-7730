import { keccak256, toBytes } from 'viem';
import { isPlainObject } from '../resolve/util.js';
import type { Hex } from '../types/descriptor.js';

export interface TypedDataField {
  name: string;
  type: string;
}

export type TypedDataTypes = Record<string, TypedDataField[] | undefined>;

const ARRAY_SUFFIX = /(\[\d*\])+$/;

function unwrapType(type: string): string {
  return type.replace(ARRAY_SUFFIX, '');
}

function findTypeDependencies(
  primaryType: string,
  types: TypedDataTypes,
  results: Set<string> = new Set()
): Set<string> {
  if (results.has(primaryType) || !types[primaryType]) {
    return results;
  }
  results.add(primaryType);
  for (const field of types[primaryType] ?? []) {
    findTypeDependencies(unwrapType(field.type), types, results);
  }
  return results;
}

/**
 * EIP-712 `encodeType`: primary type encoding followed by referenced
 * custom types in alphabetical order.
 */
export function encodeType(primaryType: string, types: TypedDataTypes): string {
  const fields = types[primaryType];
  if (!fields) {
    return primaryType;
  }

  const unsorted = findTypeDependencies(primaryType, types);
  unsorted.delete(primaryType);
  const deps = [primaryType, ...[...unsorted].sort()];

  let encoded = '';
  for (const type of deps) {
    const members = types[type] ?? [];
    encoded += `${type}(${members.map((field) => `${field.type} ${field.name}`).join(',')})`;
  }
  return encoded;
}

/** keccak256 of `encodeType` — the value stored in `index.eip712.json`. */
export function hashEncodeType(primaryType: string, types: TypedDataTypes): Hex {
  return keccak256(toBytes(encodeType(primaryType, types)));
}

function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'boolean') {
    return value ? 1n : 0n;
  }
  if (typeof value === 'string' && value !== '') {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeTypedValue(value: unknown, type: string, types: TypedDataTypes): unknown {
  const arrayMatch = type.match(/^(.*)(\[\d*\])$/);
  if (arrayMatch) {
    if (!Array.isArray(value)) {
      return value;
    }
    return value.map((item) => normalizeTypedValue(item, arrayMatch[1], types));
  }

  const nested = types[type];
  if (nested) {
    if (!isPlainObject(value)) {
      return value;
    }
    return normalizeTypedDataMessage(value, types, type);
  }

  if (type === 'address' && typeof value === 'string') {
    return value.toLowerCase();
  }

  if (/^u?int\d*$/.test(type) || type === 'uint' || type === 'int') {
    return toBigInt(value) ?? value;
  }

  return value;
}

/**
 * Coerce EIP-712 message values using `types` (addresses lowercased, integers
 * to bigint, nested structs / arrays walked).
 */
export function normalizeTypedDataMessage(
  message: Record<string, unknown>,
  types: TypedDataTypes,
  primaryType: string
): Record<string, unknown> {
  const fields = types[primaryType];
  if (!fields) {
    return { ...message };
  }
  const out: Record<string, unknown> = { ...message };
  for (const field of fields) {
    if (!Object.hasOwn(message, field.name)) {
      continue;
    }
    out[field.name] = normalizeTypedValue(message[field.name], field.type, types);
  }
  return out;
}
