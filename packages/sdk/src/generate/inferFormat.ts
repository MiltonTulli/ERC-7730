/**
 * Infer ERC-7730 v2 field format from ABI parameter name and type.
 *
 * Spec format names come from erc7730-v2.schema.json (`addressName`, not the
 * ROADMAP alias `addressOrName`). Generated drafts are untrusted.
 */

import type { ERC7730V2FieldFormat, FieldParams } from '../types/v2.js';

export interface InferredFormat {
  format: ERC7730V2FieldFormat;
  params?: FieldParams;
  /** Set when the ABI `internalType` is a Solidity enum. */
  enumName?: string;
}

export interface InferFormatContext {
  /** When the ABI looks like ERC-20, token amounts use `tokenPath: "@.to"`. */
  looksLikeErc20?: boolean;
  /** Solidity `internalType` from the ABI JSON (e.g. `enum IPool.InterestRateMode`). */
  internalType?: string;
}

const SHORT_KEYWORD = 3;

/**
 * Split camelCase / snake_case names so short keywords like `to` do not match
 * inside `token` or `total`.
 */
export function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function containsAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  const parts = nameTokens(name);
  return keywords.some((keyword) => {
    const needle = keyword.toLowerCase();
    if (needle.length <= SHORT_KEYWORD) {
      return parts.includes(needle);
    }
    return lower.includes(needle) || parts.includes(needle);
  });
}

const ADDRESS_RECIPIENT_KEYS = [
  'from',
  'to',
  'owner',
  'recipient',
  'receiver',
  'account',
  'sender',
  'user',
];

const DATE_KEYS = [
  'deadline',
  'expiration',
  'expiry',
  'until',
  'time',
  'timestamp',
  'validUntil',
  'validAfter',
];

const TOKEN_AMOUNT_KEYS = ['amount', 'value', 'assets', 'wad', 'balance', 'quantity'];

/**
 * Path-safe `metadata.enums` key from Solidity `internalType`.
 *
 * Unqualified `enum Status` stays `Status`. Qualified names keep the prefix so
 * `enum PoolA.Status` and `enum PoolB.Status` do not share a key. Dots and `$`
 * become `_` because `$ref` is `$.metadata.enums.${key}` (dot-separated path).
 */
export function solidityEnumName(internalType: string | undefined): string | undefined {
  if (!internalType) {
    return undefined;
  }
  const match = internalType.trim().match(/^enum\s+([\w$.]+)$/);
  if (!match) {
    return undefined;
  }
  return match[1].replace(/[.$]+/g, '_');
}

/**
 * Infer format from ABI parameter name and type.
 */
export function inferFormat(
  name: string,
  type: string,
  ctx: InferFormatContext = {}
): InferredFormat {
  const normalizedType = type.toLowerCase();
  const enumName = solidityEnumName(ctx.internalType);

  if (enumName) {
    return {
      format: 'enum',
      params: { $ref: `$.metadata.enums.${enumName}` },
      enumName,
    };
  }

  if (normalizedType === 'address') {
    if (containsAny(name, ['collection', 'nft'])) {
      return { format: 'addressName', params: { types: ['collection'] } };
    }
    if (containsAny(name, ['spender', 'operator'])) {
      return { format: 'addressName', params: { types: ['contract'] } };
    }
    if (containsAny(name, ['asset', 'token', 'currency'])) {
      return { format: 'addressName', params: { types: ['token'] } };
    }
    if (containsAny(name, ADDRESS_RECIPIENT_KEYS)) {
      return { format: 'addressName', params: { types: ['eoa', 'contract'] } };
    }
    return { format: 'addressName' };
  }

  if (normalizedType.startsWith('uint') || normalizedType.startsWith('int')) {
    if (containsAny(name, ['duration', 'period', 'interval'])) {
      return { format: 'duration' };
    }
    if (normalizedType.startsWith('uint') && containsAny(name, ['height', 'block'])) {
      return { format: 'date', params: { encoding: 'blockheight' } };
    }
    if (containsAny(name, DATE_KEYS)) {
      return { format: 'date', params: { encoding: 'timestamp' } };
    }
    if (
      containsAny(name, TOKEN_AMOUNT_KEYS) ||
      (normalizedType.startsWith('int') && containsAny(name, ['delta']))
    ) {
      const inferred: InferredFormat = { format: 'tokenAmount' };
      if (ctx.looksLikeErc20) {
        inferred.params = { tokenPath: '@.to' };
      }
      return inferred;
    }
    return { format: 'raw' };
  }

  return { format: 'raw' };
}

/**
 * Generate a human-readable label from parameter name.
 */
export function inferLabel(name: string): string {
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
    wad: 'Wad',
  };

  const label = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (abbreviations[lower]) {
        return abbreviations[lower];
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return label || 'Value';
}
