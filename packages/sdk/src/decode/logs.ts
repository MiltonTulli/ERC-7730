import { isPlainObject } from '../resolve/util';
import { ADDRESS_RE } from '../util';
import type { Address } from './types';

/** Pull 20-byte addresses out of decoded log values, topics, and data words. */
export function collectAddresses(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (ADDRESS_RE.test(value)) {
      into.add(value.toLowerCase());
      return;
    }
    // Indexed addresses are 32-byte topics (`0x` + 24 zero bytes + 20-byte address).
    if (/^0x0{24}[0-9a-fA-F]{40}$/i.test(value)) {
      const address = value.slice(-40).toLowerCase();
      into.add(`0x${address}` as Address);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAddresses(item, into);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) {
      collectAddresses(item, into);
    }
  }
}
