import type { IncludeLoader, InputDescriptor } from '../types/descriptor.js';
import { DescriptorResolveError } from './error.js';
import { cloneJson, isPlainObject } from './util.js';

const MAX_INCLUDE_DEPTH = 32;

/**
 * Merge `overlay` onto `base`. Overlay wins on scalar/array conflicts.
 *
 * `fields` arrays (EIP-7730) merge by `path`: objects that share a path are
 * deep-merged (overlay params override included params); new paths are appended.
 *
 * python-erc7730 currently replaces the whole `fields` array instead. That is
 * a documented divergence; this implementation follows the EIP.
 */
export function mergeDescriptorDocs(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  return mergeObjects(base, overlay);
}

function mergeValues(base: unknown, overlay: unknown, key: string): unknown {
  if (overlay === undefined) {
    return cloneJson(base);
  }
  if (base === undefined) {
    return cloneJson(overlay);
  }
  if (isPlainObject(base) && isPlainObject(overlay)) {
    return mergeObjects(base, overlay);
  }
  if (Array.isArray(base) && Array.isArray(overlay) && key === 'fields') {
    return mergeFields(base, overlay);
  }
  return cloneJson(overlay);
}

function mergeObjects(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(overlay)]);
  for (const key of keys) {
    if (!(key in overlay)) {
      result[key] = cloneJson(base[key]);
    } else if (!(key in base)) {
      result[key] = cloneJson(overlay[key]);
    } else {
      result[key] = mergeValues(base[key], overlay[key], key);
    }
  }
  return result;
}

function mergeFields(base: unknown[], overlay: unknown[]): unknown[] {
  const result: unknown[] = base.map((item) => cloneJson(item));
  const indexByPath = new Map<string, number>();
  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (isPlainObject(item) && typeof item.path === 'string') {
      indexByPath.set(item.path, i);
    }
  }

  for (const item of overlay) {
    if (isPlainObject(item) && typeof item.path === 'string' && indexByPath.has(item.path)) {
      const index = indexByPath.get(item.path);
      if (index === undefined) {
        continue;
      }
      const existing = result[index];
      result[index] = isPlainObject(existing) ? mergeObjects(existing, item) : cloneJson(item);
    } else {
      result.push(cloneJson(item));
    }
  }
  return result;
}

function includeRefs(includes: unknown): string[] {
  if (includes === undefined || includes === null || includes === '') {
    return [];
  }
  if (typeof includes === 'string') {
    return [includes];
  }
  if (Array.isArray(includes) && includes.every((ref) => typeof ref === 'string')) {
    return includes as string[];
  }
  throw new DescriptorResolveError(
    'includes must be a URI string (or a list of URI strings)',
    '/includes'
  );
}

/**
 * Recursively load and merge `includes`. The including document wins.
 */
export async function mergeIncludes(
  input: InputDescriptor,
  loader: IncludeLoader,
  stack: string[] = []
): Promise<Record<string, unknown>> {
  if (!isPlainObject(input)) {
    throw new DescriptorResolveError('Descriptor must be a JSON object', '/');
  }

  const cloned = cloneJson(input) as Record<string, unknown>;
  const refs = includeRefs(cloned.includes);
  const current: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cloned)) {
    if (key !== 'includes') {
      current[key] = value;
    }
  }

  if (refs.length === 0) {
    return current;
  }

  if (stack.length + refs.length > MAX_INCLUDE_DEPTH) {
    throw new DescriptorResolveError(`Include depth exceeds ${MAX_INCLUDE_DEPTH}`, '/includes');
  }

  let merged: Record<string, unknown> = {};
  for (const ref of refs) {
    if (stack.includes(ref)) {
      throw new DescriptorResolveError(
        `Circular include: ${[...stack, ref].join(' -> ')}`,
        '/includes'
      );
    }

    let loaded: unknown;
    try {
      loaded = await loader.load(ref, input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DescriptorResolveError(`Failed to load include "${ref}": ${message}`, '/includes');
    }

    if (!isPlainObject(loaded)) {
      throw new DescriptorResolveError(
        `Include "${ref}" did not resolve to a JSON object`,
        '/includes'
      );
    }

    const parent = await mergeIncludes(loaded as InputDescriptor, loader, [...stack, ref]);
    merged = mergeObjects(merged, parent);
  }

  return mergeObjects(merged, current);
}
