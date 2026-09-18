/**
 * Resolve ERC-7730 field paths against decoded data, the merged descriptor,
 * and the transaction / EIP-712 envelope.
 *
 * Roots (EIP-7730):
 *   #.  structured data (decoded args or EIP-712 message)
 *   $.  merged descriptor document
 *   @.  envelope: from, to, value, chainId
 *
 * Rootless paths are relative to the structured data, or to `ctx.base` when
 * set (nested `tokenPath` / `collectionPath`). Missing paths throw
 * `PathResolveError` — they do not return `undefined`.
 */

import { PathResolveError } from './error.js';
import { concatDataPath, parsePath } from './parse.js';
import type { ParsedPath, PathContext, PathEnvelope, PathSegment } from './types.js';

const HEX_RE = /^0x[0-9a-fA-F]*$/;
const WORD_BYTES = 32;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hexToBytes(hex: string): Uint8Array {
  const body = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let hex = '0x';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex as `0x${string}`;
}

function bigintToWord(value: bigint, path: string): Uint8Array {
  if (value < 0n) {
    throw new PathResolveError('Cannot slice a negative integer', path, 'invalid');
  }
  const out = new Uint8Array(WORD_BYTES);
  let remaining = value;
  for (let i = WORD_BYTES - 1; i >= 0 && remaining > 0n; i -= 1) {
    out[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return out;
}

function asBytes(value: unknown, path: string): Uint8Array | undefined {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === 'string' && HEX_RE.test(value)) {
    return hexToBytes(value.slice(2));
  }
  if (typeof value === 'bigint') {
    return bigintToWord(value, path);
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return bigintToWord(BigInt(value), path);
  }
  return undefined;
}

function normalizeIndex(length: number, index: number): number | undefined {
  const resolved = index < 0 ? length + index : index;
  if (resolved < 0 || resolved >= length) {
    return undefined;
  }
  return resolved;
}

function sliceBounds(
  length: number,
  start: number | undefined,
  end: number | undefined
): { start: number; end: number } {
  const from =
    start === undefined ? 0 : start < 0 ? Math.max(length + start, 0) : Math.min(start, length);
  const to =
    end === undefined ? length : end < 0 ? Math.max(length + end, 0) : Math.min(end, length);
  return { start: from, end: Math.max(from, to) };
}

function notFound(path: string, detail: string): never {
  throw new PathResolveError(detail, path, 'not_found');
}

function walk(value: unknown, segments: PathSegment[], path: string): unknown {
  if (segments.length === 0) {
    return value;
  }

  const [head, ...tail] = segments;

  switch (head.type) {
    case 'field': {
      if (isPlainObject(value) && Object.hasOwn(value, head.name)) {
        return walk(value[head.name], tail, path);
      }
      if (Array.isArray(value) && /^-?[0-9]+$/.test(head.name)) {
        return walk(value, [{ type: 'index', index: Number(head.name) }, ...tail], path);
      }
      return notFound(path, `No field "${head.name}"`);
    }
    case 'index': {
      if (Array.isArray(value)) {
        const index = normalizeIndex(value.length, head.index);
        if (index === undefined) {
          notFound(path, `Index ${head.index} is out of range`);
        }
        return walk(value[index], tail, path);
      }
      const bytes = asBytes(value, path);
      if (bytes) {
        const index = normalizeIndex(bytes.length, head.index);
        if (index === undefined) {
          notFound(path, `Byte index ${head.index} is out of range`);
        }
        if (tail.length > 0) {
          throw new PathResolveError('Cannot walk past a single byte', path, 'invalid');
        }
        return bytes[index];
      }
      return notFound(path, 'Index selector requires an array or bytes value');
    }
    case 'slice': {
      if (Array.isArray(value)) {
        const { start, end } = sliceBounds(value.length, head.start, head.end);
        const sliced = value.slice(start, end);
        if (tail.length === 0) {
          return sliced;
        }
        return sliced.map((item) => walk(item, tail, path));
      }
      const bytes = asBytes(value, path);
      if (bytes) {
        if (tail.length > 0) {
          throw new PathResolveError('Cannot walk past a byte slice', path, 'invalid');
        }
        const { start, end } = sliceBounds(bytes.length, head.start, head.end);
        return bytesToHex(bytes.subarray(start, end));
      }
      return notFound(path, 'Slice selector requires an array or bytes value');
    }
    case 'all': {
      if (Array.isArray(value)) {
        if (tail.length === 0) {
          return value;
        }
        return value.map((item) => walk(item, tail, path));
      }
      if (asBytes(value, path) && tail.length === 0) {
        return value;
      }
      return notFound(path, 'Array selector [] requires an array (or bytes) value');
    }
  }
}

function resolveContainer(parsed: ParsedPath, envelope: PathEnvelope, path: string): unknown {
  const field = parsed.segments[0];
  if (field.type !== 'field') {
    throw new PathResolveError('Container paths must name a field', path, 'invalid');
  }
  const value = envelope[field.name as keyof PathEnvelope];
  if (value === undefined) {
    notFound(path, `Envelope field "@.${field.name}" is not set`);
  }
  return value;
}

function structuredData(ctx: PathContext, path: string): unknown {
  if (ctx.args !== undefined) {
    return ctx.args;
  }
  if (ctx.message !== undefined) {
    return ctx.message;
  }
  throw new PathResolveError(
    'Structured-data path requires ctx.args or ctx.message',
    path,
    'missing_data'
  );
}

function bindRelative(parsed: ParsedPath, ctx: PathContext): ParsedPath {
  if (parsed.root !== 'data' || parsed.absolute) {
    return parsed;
  }
  if (ctx.base !== undefined) {
    return concatDataPath(parsePath(ctx.base), parsed);
  }
  return { ...parsed, absolute: true };
}

/**
 * Read the value at an ERC-7730 path.
 *
 * Missing keys, out-of-range indexes, and unknown envelope fields throw
 * `PathResolveError` with `code: "not_found"`. Invalid syntax throws
 * `code: "invalid"`.
 */
export function resolvePath(path: string, ctx: PathContext): unknown {
  const parsed = bindRelative(parsePath(path), ctx);

  switch (parsed.root) {
    case 'container':
      return resolveContainer(parsed, ctx.envelope, path);
    case 'descriptor':
      return walk(ctx.descriptor.merged, parsed.segments, path);
    case 'data':
      return walk(structuredData(ctx, path), parsed.segments, path);
    default:
      throw new PathResolveError('Unknown path root', path, 'invalid');
  }
}
