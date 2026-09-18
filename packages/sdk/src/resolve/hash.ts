/**
 * Canonical keccak256 of an ERC-7730 descriptor.
 *
 * Serialization: UTF-8 JSON, object keys sorted, no insignificant whitespace.
 * Checksum addresses (`0x` + 40 hex chars) are lowercased before hashing so
 * Node and browsers produce the same digest.
 */

import { keccak256, toBytes } from 'viem';
import type { Hex, InputDescriptor } from '../types/descriptor.js';
import { isPlainObject } from './util.js';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function canonicalize(value: unknown): unknown {
  if (typeof value === 'string') {
    return ADDRESS_RE.test(value) ? value.toLowerCase() : value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const next = value[key];
      if (next !== undefined) {
        out[key] = canonicalize(next);
      }
    }
    return out;
  }
  return value;
}

/**
 * keccak256 of the canonical JSON form of `input`.
 *
 * Call this on a merged descriptor (after includes) when the hash must cover
 * the effective content, as `resolveDescriptor()` does for `hash`.
 */
export function descriptorHash(input: InputDescriptor): Hex {
  const json = JSON.stringify(canonicalize(input));
  return keccak256(toBytes(json));
}
