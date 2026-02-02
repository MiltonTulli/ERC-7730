/**
 * Infer ERC-7730 field format from ABI parameter name and type
 * Based on python-erc7730 logic
 */

import type { AddressNameParams, DateParams, FieldFormat, FormatParams } from '../types/erc7730.js';

interface InferredFormat {
  format: FieldFormat;
  params?: FormatParams;
}

/**
 * Check if name contains any of the given keywords (case-insensitive)
 */
function containsAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Infer format from ABI parameter name and type
 */
export function inferFormat(name: string, type: string): InferredFormat {
  const normalizedType = type.toLowerCase();

  // Address type
  if (normalizedType === 'address') {
    if (containsAny(name, ['collection', 'nft'])) {
      return {
        format: 'addressName',
        params: { types: ['nft'] } as AddressNameParams,
      };
    }
    if (containsAny(name, ['spender', 'operator'])) {
      return {
        format: 'addressName',
        params: { types: ['contract'] } as AddressNameParams,
      };
    }
    if (containsAny(name, ['asset', 'token', 'currency'])) {
      return {
        format: 'addressName',
        params: { types: ['token'] } as AddressNameParams,
      };
    }
    if (
      containsAny(name, [
        'from',
        'to',
        'owner',
        'recipient',
        'receiver',
        'account',
        'sender',
        'user',
      ])
    ) {
      return {
        format: 'addressName',
        params: { types: ['eoa', 'contract'] } as AddressNameParams,
      };
    }
    // Default for address
    return { format: 'addressName' };
  }

  // Unsigned integer types
  if (normalizedType.startsWith('uint')) {
    if (containsAny(name, ['duration', 'period', 'interval'])) {
      return { format: 'duration' };
    }
    if (containsAny(name, ['height', 'block'])) {
      return {
        format: 'date',
        params: { encoding: 'blockheight' } as DateParams,
      };
    }
    if (
      containsAny(name, [
        'deadline',
        'expiration',
        'expiry',
        'until',
        'time',
        'timestamp',
        'validUntil',
        'validAfter',
      ])
    ) {
      return {
        format: 'date',
        params: { encoding: 'timestamp' } as DateParams,
      };
    }
    if (containsAny(name, ['amount', 'value', 'price', 'balance', 'quantity', 'fee', 'cost'])) {
      return { format: 'tokenAmount' };
    }
    // Default for uint - could be token amount or raw
    return { format: 'raw' };
  }

  // Signed integer types
  if (normalizedType.startsWith('int')) {
    if (containsAny(name, ['amount', 'value', 'delta'])) {
      return { format: 'tokenAmount' };
    }
    return { format: 'raw' };
  }

  // Bytes types
  if (normalizedType === 'bytes' || normalizedType.match(/^bytes\d+$/)) {
    return { format: 'raw' };
  }

  // Bool type
  if (normalizedType === 'bool') {
    return { format: 'raw' };
  }

  // String type
  if (normalizedType === 'string') {
    return { format: 'raw' };
  }

  // Array types - use raw format
  if (normalizedType.includes('[]')) {
    return { format: 'raw' };
  }

  // Tuple types - use raw format
  if (normalizedType === 'tuple') {
    return { format: 'raw' };
  }

  // Default
  return { format: 'raw' };
}

/**
 * Generate a human-readable label from parameter name
 */
export function inferLabel(name: string): string {
  // Handle common abbreviations
  const abbreviations: Record<string, string> = {
    amt: 'Amount',
    addr: 'Address',
    recv: 'Receiver',
    src: 'Source',
    dst: 'Destination',
    qty: 'Quantity',
    val: 'Value',
    tx: 'Transaction',
    msg: 'Message',
    sig: 'Signature',
    idx: 'Index',
    id: 'ID',
    nft: 'NFT',
    erc: 'ERC',
    eth: 'ETH',
  };

  // Convert camelCase/snake_case to Title Case
  let label = name
    // Insert space before uppercase letters
    .replace(/([A-Z])/g, ' $1')
    // Replace underscores with spaces
    .replace(/_/g, ' ')
    // Trim and collapse multiple spaces
    .trim()
    .replace(/\s+/g, ' ');

  // Capitalize first letter of each word
  label = label
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      // Check for abbreviations
      if (abbreviations[lower]) {
        return abbreviations[lower];
      }
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return label || 'Value';
}
