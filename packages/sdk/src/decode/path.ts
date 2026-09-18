import { isPlainObject } from '../resolve/util.js';
import type { ResolvedDescriptor } from '../types/descriptor.js';

export class PathResolveError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`Invalid path ${JSON.stringify(path)}: ${message}`);
    this.name = 'PathResolveError';
    this.path = path;
  }
}

export interface PathEnvelope {
  to?: string;
  value?: bigint | string;
  chainId?: number;
  from?: string;
  data?: string;
  nonce?: bigint | string;
  gas?: bigint | string;
}

export interface PathContext {
  args?: unknown;
  message?: unknown;
  descriptor?: Pick<ResolvedDescriptor, 'merged'> | ResolvedDescriptor | unknown;
  envelope?: PathEnvelope;
}

type Segment =
  | { kind: 'key'; name: string }
  | { kind: 'index'; index: number }
  | { kind: 'all' }
  | { kind: 'slice'; start?: number; end?: number };

function descriptorRoot(ctx: PathContext): unknown {
  const descriptor = ctx.descriptor;
  if (descriptor && typeof descriptor === 'object' && 'merged' in descriptor) {
    return (descriptor as { merged: unknown }).merged;
  }
  return descriptor;
}

function structuredRoot(ctx: PathContext): unknown {
  if (ctx.args !== undefined) {
    return ctx.args;
  }
  return ctx.message;
}

function envelopeRoot(ctx: PathContext): Record<string, unknown> {
  const envelope = ctx.envelope ?? {};
  return {
    from: envelope.from,
    to: envelope.to,
    value: envelope.value,
    chainId: envelope.chainId,
    data: envelope.data,
    nonce: envelope.nonce,
    gas: envelope.gas,
  };
}

function parseRoot(path: string): { root: '#' | '$' | '@'; rest: string } {
  if (path === '#' || path.startsWith('#.')) {
    return { root: '#', rest: path === '#' ? '' : path.slice(2) };
  }
  if (path === '$' || path.startsWith('$.')) {
    return { root: '$', rest: path === '$' ? '' : path.slice(2) };
  }
  if (path === '@' || path.startsWith('@.')) {
    return { root: '@', rest: path === '@' ? '' : path.slice(2) };
  }
  return { root: '#', rest: path };
}

function parseSegments(path: string, rest: string): Segment[] {
  if (rest === '') {
    return [];
  }

  const segments: Segment[] = [];
  let i = 0;

  while (i < rest.length) {
    if (rest[i] === '.') {
      i++;
      continue;
    }

    if (rest[i] === '[') {
      const close = rest.indexOf(']', i);
      if (close === -1) {
        throw new PathResolveError(path, 'unmatched "["');
      }
      const inner = rest.slice(i + 1, close).trim();
      i = close + 1;

      if (inner === '') {
        segments.push({ kind: 'all' });
        continue;
      }

      if (inner.includes(':')) {
        const [startRaw, endRaw] = inner.split(':');
        const start = startRaw.trim() === '' ? undefined : Number(startRaw);
        const end = endRaw.trim() === '' ? undefined : Number(endRaw);
        if (start !== undefined && !Number.isInteger(start)) {
          throw new PathResolveError(path, `invalid slice start "${inner}"`);
        }
        if (end !== undefined && !Number.isInteger(end)) {
          throw new PathResolveError(path, `invalid slice end "${inner}"`);
        }
        segments.push({ kind: 'slice', start, end });
        continue;
      }

      const index = Number(inner);
      if (!Number.isInteger(index)) {
        throw new PathResolveError(path, `invalid index "${inner}"`);
      }
      segments.push({ kind: 'index', index });
      continue;
    }

    const start = i;
    while (i < rest.length && rest[i] !== '.' && rest[i] !== '[') {
      i++;
    }
    const name = rest.slice(start, i);
    if (name === '') {
      throw new PathResolveError(path, 'empty path segment');
    }
    segments.push({ kind: 'key', name });
  }

  return segments;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (isPlainObject(value)) {
    return value;
  }
  return undefined;
}

function hexBytes(value: string): string | undefined {
  if (!value.startsWith('0x') && !value.startsWith('0X')) {
    return undefined;
  }
  const hex = value.slice(2);
  if (hex.length % 2 !== 0) {
    return undefined;
  }
  return hex;
}

function applySlice(value: unknown, start: number | undefined, end: number | undefined): unknown {
  if (Array.isArray(value)) {
    return value.slice(start ?? 0, end);
  }
  if (typeof value === 'string') {
    const hex = hexBytes(value);
    if (hex !== undefined) {
      const from = (start ?? 0) * 2;
      const to = end === undefined ? hex.length : end * 2;
      return `0x${hex.slice(from, to)}`;
    }
    return value.slice(start ?? 0, end);
  }
  return undefined;
}

function readIndex(value: unknown, index: number): unknown {
  if (Array.isArray(value)) {
    const i = index < 0 ? value.length + index : index;
    return value[i];
  }
  if (typeof value === 'string') {
    const hex = hexBytes(value);
    if (hex !== undefined) {
      const i = index < 0 ? hex.length / 2 + index : index;
      const offset = i * 2;
      if (offset < 0 || offset + 2 > hex.length) {
        return undefined;
      }
      return `0x${hex.slice(offset, offset + 2)}`;
    }
  }
  const record = asRecord(value);
  if (record) {
    return record[String(index)];
  }
  return undefined;
}

function readKey(value: unknown, name: string): unknown {
  if (Array.isArray(value)) {
    const n = Number(name);
    if (name !== '' && Number.isInteger(n)) {
      return readIndex(value, n);
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  if (name in record) {
    return record[name];
  }
  if (/^\d+$/.test(name)) {
    return record[name];
  }
  return undefined;
}

function walk(value: unknown, segments: Segment[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined;
    }
    switch (segment.kind) {
      case 'key':
        current = readKey(current, segment.name);
        break;
      case 'index':
        current = readIndex(current, segment.index);
        break;
      case 'all':
        if (!Array.isArray(current)) {
          return undefined;
        }
        break;
      case 'slice':
        current = applySlice(current, segment.start, segment.end);
        break;
    }
  }
  return current;
}

/**
 * Resolve an ERC-7730 field path.
 *
 * Roots: `#` structured data (args / message), `$` merged descriptor, `@` envelope.
 * A path without a root is relative to `#`. Missing values return `undefined`.
 * Malformed paths throw `PathResolveError`.
 */
export function resolvePath(path: string, ctx: PathContext): unknown {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new PathResolveError(path, 'empty path');
  }

  const trimmed = path.trim();
  const { root, rest } = parseRoot(trimmed);
  const segments = parseSegments(trimmed, rest);

  let base: unknown;
  switch (root) {
    case '#':
      base = structuredRoot(ctx);
      break;
    case '$':
      base = descriptorRoot(ctx);
      break;
    case '@':
      base = envelopeRoot(ctx);
      break;
  }

  if (segments.length === 0) {
    return base;
  }
  return walk(base, segments);
}
