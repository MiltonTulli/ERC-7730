import { PathResolveError } from './error.js';
import type { ParsedPath, PathRoot, PathSegment } from './types.js';

const FIELD_RE = /^[a-zA-Z0-9_]+/;
const INDEX_RE = /^-?[0-9]+$/;
const CONTAINER_FIELDS = new Set(['from', 'to', 'value', 'chainId']);

function invalid(path: string, message: string): never {
  throw new PathResolveError(message, path, 'invalid');
}

function parseIndex(raw: string, path: string): number {
  if (!INDEX_RE.test(raw)) {
    invalid(path, `Invalid array index "${raw}"`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    invalid(path, `Invalid array index "${raw}"`);
  }
  return value;
}

function parseIndexOpt(raw: string, path: string): number | undefined {
  if (raw === '') {
    return undefined;
  }
  return parseIndex(raw, path);
}

function parseBracket(inner: string, path: string): PathSegment {
  if (inner === '') {
    return { type: 'all' };
  }
  const colon = inner.indexOf(':');
  if (colon === -1) {
    return { type: 'index', index: parseIndex(inner, path) };
  }
  if (inner.indexOf(':', colon + 1) !== -1) {
    invalid(path, `Slice selectors must not include a step ("[${inner}]")`);
  }
  const start = parseIndexOpt(inner.slice(0, colon), path);
  const end = parseIndexOpt(inner.slice(colon + 1), path);
  return { type: 'slice', start, end };
}

function tokenize(input: string, path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (char === '.') {
      if (i === 0 || i === input.length - 1 || input[i + 1] === '.') {
        invalid(path, 'Empty path component');
      }
      i += 1;
      continue;
    }
    if (char === '[') {
      const close = input.indexOf(']', i);
      if (close === -1) {
        invalid(path, 'Unclosed array selector');
      }
      segments.push(parseBracket(input.slice(i + 1, close), path));
      i = close + 1;
      continue;
    }
    const match = FIELD_RE.exec(input.slice(i));
    if (!match) {
      invalid(path, `Unexpected character "${char}"`);
    }
    segments.push({ type: 'field', name: match[0] });
    i += match[0].length;
  }

  if (segments.length === 0) {
    invalid(path, 'Path has no components');
  }
  return segments;
}

function stripRoot(path: string): { root: PathRoot; absolute: boolean; rest: string } {
  if (path.startsWith('#.')) {
    return { root: 'data', absolute: true, rest: path.slice(2) };
  }
  if (path.startsWith('$.')) {
    return { root: 'descriptor', absolute: true, rest: path.slice(2) };
  }
  if (path.startsWith('@.')) {
    return { root: 'container', absolute: true, rest: path.slice(2) };
  }
  if (path === '#' || path === '$' || path === '@') {
    invalid(path, 'Root must be followed by "." and at least one component');
  }
  if (path.startsWith('#') || path.startsWith('$') || path.startsWith('@')) {
    invalid(path, 'Root must use dot notation (#.field, $.field, @.field)');
  }
  return { root: 'data', absolute: false, rest: path };
}

/**
 * Parse an ERC-7730 path (`#.`, `$.`, `@.`, or rootless / relative).
 *
 * Dot notation is required by the spec (`pools.[-1]`, `path.[0:20]`). Compact
 * `tokens[0]` / `data[:32]` forms from EIP examples are also accepted.
 */
export function parsePath(path: string): ParsedPath {
  if (typeof path !== 'string' || path.length === 0) {
    invalid(path ?? '', 'Path must be a non-empty string');
  }

  const { root, absolute, rest } = stripRoot(path);
  if (rest.length === 0) {
    invalid(path, 'Path has no components after the root');
  }

  const segments = tokenize(rest, path);

  if (root === 'container') {
    const first = segments[0];
    if (segments.length !== 1 || first.type !== 'field') {
      invalid(path, 'Container paths must be @.from, @.to, @.value, or @.chainId');
    }
    if (!CONTAINER_FIELDS.has(first.name)) {
      invalid(path, `Unknown container field "@.${first.name}"`);
    }
  }

  if (root === 'descriptor') {
    for (const segment of segments) {
      if (segment.type === 'all' || segment.type === 'slice') {
        invalid(path, 'Descriptor paths support field names and [index] only');
      }
    }
  }

  return { root, absolute, segments, raw: path };
}

export function concatDataPath(base: ParsedPath, child: ParsedPath): ParsedPath {
  if (child.root !== 'data' || child.absolute) {
    return child;
  }
  if (base.root !== 'data') {
    throw new PathResolveError(
      'Relative data path requires a #. (or rootless) base',
      child.raw,
      'invalid'
    );
  }
  return {
    root: 'data',
    absolute: base.absolute,
    segments: [...base.segments, ...child.segments],
    raw: child.raw,
  };
}
