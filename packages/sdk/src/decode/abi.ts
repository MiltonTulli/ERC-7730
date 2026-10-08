import { decodeParameters } from '../core/decoder';
import { computeSelector } from '../core/signatures';
import { FORBIDDEN_KEYS } from '../resolve/util';

export interface ParsedParam {
  type: string;
  name?: string;
  components?: ParsedParam[];
}

export interface ParsedDeclaration {
  name: string;
  params: ParsedParam[];
  canonical: string;
  selector: string;
}

const DATA_LOCATIONS = new Set(['calldata', 'memory', 'storage']);

const TYPE_ALIASES: Record<string, string> = {
  uint: 'uint256',
  int: 'int256',
  ufixed: 'ufixed128x18',
  fixed: 'fixed128x18',
};

const WELL_KNOWN_NAMES: Record<string, string[]> = {
  'transfer(address,uint256)': ['to', 'amount'],
  'approve(address,uint256)': ['spender', 'amount'],
  'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)': [
    'owner',
    'spender',
    'value',
    'deadline',
    'v',
    'r',
    's',
  ],
  'transferFrom(address,address,uint256)': ['from', 'to', 'amount'],
  'safeTransferFrom(address,address,uint256)': ['from', 'to', 'tokenId'],
  'safeTransferFrom(address,address,uint256,bytes)': ['from', 'to', 'tokenId', 'data'],
  'setApprovalForAll(address,bool)': ['operator', 'approved'],
  'increaseAllowance(address,uint256)': ['spender', 'addedValue'],
  'decreaseAllowance(address,uint256)': ['spender', 'subtractedValue'],
  'withdraw(uint256)': ['amount'],
  'deposit()': [],
};

function findMatchingParen(src: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    if (src[i] === '(') {
      depth++;
    } else if (src[i] === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function splitTopLevel(src: string): string[] {
  if (!src.trim()) {
    return [];
  }
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of src) {
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    }
    if (char === ',' && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseArraySuffix(src: string): { type: string; rest: string } {
  const match = src.match(/^((?:\[[\d]*\])+)\s*(.*)$/);
  if (!match) {
    return { type: '', rest: src.trim() };
  }
  return { type: match[1], rest: match[2].trim() };
}

function canonicalizeType(type: string): string {
  const arrayMatch = type.match(/^(.*?)((?:\[\d*\])+)$/);
  const base = arrayMatch ? arrayMatch[1] : type;
  const suffix = arrayMatch ? arrayMatch[2] : '';
  const mapped =
    base !== undefined && Object.hasOwn(TYPE_ALIASES, base) ? TYPE_ALIASES[base] : base;
  return `${mapped}${suffix}`;
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f';
}

function isIdentStart(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === '_';
}

function isIdentPart(char: string): boolean {
  const code = char.charCodeAt(0);
  return isIdentStart(char) || (code >= 48 && code <= 57);
}

/** Linear split of `name(params)`. Avoids the polynomial declaration regex. */
function splitDeclaration(src: string): { name: string; paramsSrc: string } | null {
  const n = src.length;
  let i = 0;
  while (i < n && isSpace(src[i] ?? '')) {
    i++;
  }
  if (i >= n || !isIdentStart(src[i] ?? '')) {
    return null;
  }
  const start = i;
  i++;
  while (i < n && isIdentPart(src[i] ?? '')) {
    i++;
  }
  const name = src.slice(start, i);
  while (i < n && isSpace(src[i] ?? '')) {
    i++;
  }
  if (i >= n || src[i] !== '(') {
    return null;
  }
  const close = findMatchingParen(src, i);
  if (close === -1) {
    return null;
  }
  let end = close + 1;
  while (end < n && isSpace(src[end] ?? '')) {
    end++;
  }
  if (end !== n) {
    return null;
  }
  return { name, paramsSrc: src.slice(i + 1, close) };
}

export function parseParams(src: string): ParsedParam[] {
  const trimmed = src.trim();
  if (!trimmed) {
    return [];
  }
  return splitTopLevel(trimmed).map(parseParam);
}

function parseParam(src: string): ParsedParam {
  const trimmed = src.trim();
  if (trimmed.startsWith('(')) {
    const close = findMatchingParen(trimmed, 0);
    if (close === -1) {
      return { type: trimmed };
    }
    const inner = trimmed.slice(1, close);
    const after = trimmed.slice(close + 1).trim();
    const { type: suffix, rest } = parseArraySuffix(after);
    const tokens = rest.split(/\s+/).filter((token) => token && !DATA_LOCATIONS.has(token));
    const components = parseParams(inner);
    const innerTypes = components.map((item) => item.type).join(',');
    return {
      type: `(${innerTypes})${suffix}`,
      name: tokens.join(' ') || undefined,
      components,
    };
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token && !DATA_LOCATIONS.has(token));
  const type = canonicalizeType(tokens[0] ?? trimmed);
  const name = tokens.slice(1).join(' ') || undefined;
  return { type, name: name || undefined };
}

/**
 * Canonical ABI signature used for 4-byte selectors: no names, no spaces.
 */
export function canonicalizeDeclaration(declaration: string): string {
  const trimmed = declaration.trim();
  if (trimmed.startsWith('0x')) {
    return trimmed.toLowerCase();
  }
  const split = splitDeclaration(declaration);
  if (!split) {
    return trimmed.replace(/\s+/g, '');
  }
  const params = parseParams(split.paramsSrc);
  return `${split.name}(${params.map((param) => param.type).join(',')})`;
}

export function parseDeclaration(declaration: string): ParsedDeclaration | null {
  const trimmed = declaration.trim();
  if (trimmed.startsWith('0x')) {
    return null;
  }
  const split = splitDeclaration(declaration);
  if (!split) {
    return null;
  }
  const params = parseParams(split.paramsSrc);
  const canonical = `${split.name}(${params.map((param) => param.type).join(',')})`;
  return {
    name: split.name,
    params,
    canonical,
    selector: computeSelector(canonical),
  };
}

function nestValue(value: unknown, param: ParsedParam): unknown {
  if (!param.components || param.components.length === 0) {
    return value;
  }
  const arraySuffix = param.type.match(/\[(\d*)\]$/);
  if (arraySuffix && Array.isArray(value)) {
    const innerType = param.type.slice(0, -arraySuffix[0].length);
    return value.map((item) => nestValue(item, { ...param, type: innerType }));
  }
  if (Array.isArray(value)) {
    return zipNamedArgs(value, param.components);
  }
  return value;
}

export function zipNamedArgs(
  values: readonly unknown[],
  params: ParsedParam[],
  aliases?: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null);
  const assign = (key: string, value: unknown) => {
    if (!FORBIDDEN_KEYS.has(key)) {
      result[key] = value;
    }
  };
  for (let i = 0; i < values.length; i++) {
    const param = params[i];
    const nested = param ? nestValue(values[i], param) : values[i];
    assign(String(i), nested);
    assign(`[${i}]`, nested);
    if (param?.name) {
      assign(param.name, nested);
    } else if (aliases?.[i]) {
      assign(aliases[i], nested);
    }
  }
  return result;
}

export function decodeNamedArgs(
  data: string,
  declaration: ParsedDeclaration | null
): { positional: unknown[]; named: Record<string, unknown> } {
  if (!declaration) {
    return { positional: [], named: {} };
  }
  const types = declaration.params.map((param) => param.type);
  const paramsData = data.length >= 10 ? data.slice(10) : '';
  let positional: unknown[] = [];
  if (types.length > 0 && paramsData) {
    try {
      positional = decodeParameters(types, paramsData);
    } catch {
      return {
        positional: [paramsData],
        named: {},
      };
    }
  }
  const aliases = Object.hasOwn(WELL_KNOWN_NAMES, declaration.canonical)
    ? WELL_KNOWN_NAMES[declaration.canonical]
    : undefined;
  return {
    positional,
    named: zipNamedArgs(positional, declaration.params, aliases),
  };
}

export function wellKnownAliases(canonical: string): string[] | undefined {
  return Object.hasOwn(WELL_KNOWN_NAMES, canonical) ? WELL_KNOWN_NAMES[canonical] : undefined;
}
