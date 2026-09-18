import { decodeParameters } from '../core/decoder.js';
import { computeSelector } from '../core/signatures.js';

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

const WELL_KNOWN_NAMES: Record<string, string[]> = {
  'transfer(address,uint256)': ['to', 'amount'],
  'approve(address,uint256)': ['spender', 'amount'],
  'transferFrom(address,address,uint256)': ['from', 'to', 'amount'],
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

export function parseParams(src: string): ParsedParam[] {
  return splitTopLevel(src).map(parseParam);
}

function parseParam(raw: string): ParsedParam {
  const src = raw.trim();
  if (src.startsWith('(')) {
    const close = findMatchingParen(src, 0);
    if (close === -1) {
      return { type: src };
    }
    const inner = src.slice(1, close);
    const after = src.slice(close + 1).trim();
    const { type: suffix, rest } = parseArraySuffix(after);
    const components = parseParams(inner);
    const innerTypes = components.map((item) => item.type).join(',');
    return {
      type: `(${innerTypes})${suffix}`,
      name: rest || undefined,
      components,
    };
  }

  const tokens = src.split(/\s+/);
  const type = tokens[0] ?? src;
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
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/s);
  if (!match) {
    return trimmed.replace(/\s+/g, '');
  }
  const name = match[1];
  const params = parseParams(match[2] ?? '');
  return `${name}(${params.map((param) => param.type).join(',')})`;
}

export function parseDeclaration(declaration: string): ParsedDeclaration | null {
  const trimmed = declaration.trim();
  if (trimmed.startsWith('0x')) {
    return null;
  }
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/s);
  if (!match) {
    return null;
  }
  const name = match[1];
  const params = parseParams(match[2] ?? '');
  const canonical = `${name}(${params.map((param) => param.type).join(',')})`;
  return {
    name,
    params,
    canonical,
    selector: computeSelector(canonical),
  };
}

function nestValue(value: unknown, param: ParsedParam): unknown {
  if (!param.components || param.components.length === 0) {
    return value;
  }
  if (param.type.endsWith('[]') && Array.isArray(value)) {
    return value.map((item) => nestValue(item, { ...param, type: param.type.slice(0, -2) }));
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
  const result: Record<string, unknown> = {};
  for (let i = 0; i < values.length; i++) {
    const param = params[i];
    const nested = param ? nestValue(values[i], param) : values[i];
    result[String(i)] = nested;
    result[`[${i}]`] = nested;
    if (param?.name) {
      result[param.name] = nested;
    } else if (aliases?.[i]) {
      result[aliases[i]] = nested;
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
      positional = [paramsData];
    }
  }
  const aliases = WELL_KNOWN_NAMES[declaration.canonical];
  return {
    positional,
    named: zipNamedArgs(positional, declaration.params, aliases),
  };
}

export function wellKnownAliases(canonical: string): string[] | undefined {
  return WELL_KNOWN_NAMES[canonical];
}
