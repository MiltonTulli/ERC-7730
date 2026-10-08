import { Hash, Hex } from 'ox';

const HEX_RE = /^0x(?:[0-9a-fA-F]{2})*$/;

/** keccak256 of UTF-8 text, or of the bytes when `value` is even-length hex. */
export function keccak256(value: string | Uint8Array): `0x${string}` {
  if (typeof value !== 'string') {
    return Hash.keccak256(value, { as: 'Hex' });
  }
  if (HEX_RE.test(value)) {
    return Hash.keccak256(value as `0x${string}`);
  }
  return Hash.keccak256(Hex.fromString(value));
}
