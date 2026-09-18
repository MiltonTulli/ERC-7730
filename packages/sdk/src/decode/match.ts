import { computeSelector, getSignatureBySelector } from '../core/signatures.js';
import { isPlainObject } from '../resolve/util.js';
import type { DisplayFormat } from '../types/v2.js';
import { type ParsedDeclaration, canonicalizeDeclaration, parseDeclaration } from './abi.js';

export interface MatchedFormat {
  key: string;
  format: DisplayFormat & {
    required?: string[];
    excluded?: string[];
  };
  declaration: ParsedDeclaration | null;
}

function asFormats(display: unknown): Record<string, unknown> | null {
  if (!isPlainObject(display) || !isPlainObject(display.formats)) {
    return null;
  }
  return display.formats;
}

function selectorOfKey(key: string): string | null {
  const trimmed = key.trim();
  if (/^0x[0-9a-fA-F]{8}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  try {
    const canonical = canonicalizeDeclaration(trimmed);
    if (canonical.startsWith('0x')) {
      return canonical;
    }
    return computeSelector(canonical);
  } catch {
    return null;
  }
}

/**
 * Match a descriptor format key by 4-byte selector, canonical signature, or
 * Solidity declaration — whichever the descriptor uses.
 */
export function matchFormat(merged: unknown, selector: string): MatchedFormat | null {
  if (!isPlainObject(merged)) {
    return null;
  }
  const formats = asFormats(merged.display);
  if (!formats) {
    return null;
  }

  const want = selector.toLowerCase();
  const known = getSignatureBySelector(want);

  for (const [key, value] of Object.entries(formats)) {
    if (!isPlainObject(value)) {
      continue;
    }
    const keySelector = selectorOfKey(key);
    if (keySelector === want) {
      return {
        key,
        format: value as MatchedFormat['format'],
        declaration: parseDeclaration(key) ?? (known ? parseDeclaration(known.signature) : null),
      };
    }
    const canonical = canonicalizeDeclaration(key);
    if (known && canonical === known.signature) {
      return {
        key,
        format: value as MatchedFormat['format'],
        declaration: parseDeclaration(key) ?? parseDeclaration(known.signature),
      };
    }
  }

  return null;
}

/**
 * Match a descriptor format key by EIP-712 `encodeType` string, primaryType
 * name, or a Solidity-style declaration whose name is `primaryType`.
 */
export function matchEip712Format(
  merged: unknown,
  primaryType: string,
  encoded: string
): MatchedFormat | null {
  if (!isPlainObject(merged)) {
    return null;
  }
  const formats = asFormats(merged.display);
  if (!formats) {
    return null;
  }

  let byPrimary: MatchedFormat | null = null;
  let byName: MatchedFormat | null = null;

  for (const [key, value] of Object.entries(formats)) {
    if (!isPlainObject(value)) {
      continue;
    }
    const format = value as MatchedFormat['format'];
    const declaration = parseDeclaration(key);
    if (key === encoded) {
      return { key, format, declaration };
    }
    if (key === primaryType && !byPrimary) {
      byPrimary = { key, format, declaration };
    }
    if (declaration?.name === primaryType && !byName) {
      byName = { key, format, declaration };
    }
  }

  return byPrimary ?? byName;
}
