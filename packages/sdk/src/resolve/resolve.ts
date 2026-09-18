/**
 * Resolve ERC-7730 includes and field `$ref`s into a `ResolvedDescriptor`.
 *
 * Pipeline:
 *   1. Recursively merge `includes` (including file wins; `fields` merge by path)
 *   2. Inline `$.display.definitions.*` field `$ref`s
 *   3. Lowercase deployment / verifyingContract addresses
 *   4. Hash the canonical merged JSON
 *
 * Known divergences vs python-erc7730 resolved form (prefer-zero, documented):
 * - `merged` keeps InputDescriptor shape: format keys stay ABI fragments, not
 *   4-byte selectors (selector matching is decode-time).
 * - Constants (`$.metadata.constants.*`) are not inlined; path engine (#7) reads them.
 * - Enum `params.$ref` (`$.metadata.enums.*`) is kept; it is the v2 enum format.
 * - Nested field groups are not flattened.
 * - ABI / schema HTTP URLs are not fetched (registry client is #5).
 * - `fields` arrays merge by `path` per EIP-7730; python-erc7730 overwrites the array.
 */

import { validateDescriptor } from '../schema/validate.js';
import type {
  DescriptorVersion,
  IncludeLoader,
  InputDescriptor,
  ResolvedDeployment,
  ResolvedDescriptor,
} from '../types/descriptor.js';
import { DescriptorResolveError } from './error.js';
import { descriptorHash } from './hash.js';
import { mergeIncludes } from './merge.js';
import { inlineFieldRefs } from './refs.js';
import { cloneJson, isPlainObject } from './util.js';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const ADDRESS_KEYS = new Set(['address', 'verifyingContract']);

function lowercaseBindingAddresses(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(lowercaseBindingAddresses);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (ADDRESS_KEYS.has(key) && typeof child === 'string' && ADDRESS_RE.test(child)) {
      out[key] = child.toLowerCase();
    } else {
      out[key] = lowercaseBindingAddresses(child);
    }
  }
  return out;
}

function readDeployments(context: unknown): ResolvedDeployment[] {
  if (!isPlainObject(context)) {
    return [];
  }
  const binding = isPlainObject(context.contract)
    ? context.contract
    : isPlainObject(context.eip712)
      ? context.eip712
      : undefined;
  if (!binding || !Array.isArray(binding.deployments)) {
    return [];
  }

  const deployments: ResolvedDeployment[] = [];
  for (const item of binding.deployments) {
    if (!isPlainObject(item)) {
      continue;
    }
    if (typeof item.chainId !== 'number' || typeof item.address !== 'string') {
      continue;
    }
    if (!ADDRESS_RE.test(item.address)) {
      continue;
    }
    deployments.push({
      chainId: item.chainId,
      address: item.address.toLowerCase() as `0x${string}`,
    });
  }
  return deployments;
}

function asInputDescriptor(value: Record<string, unknown>): InputDescriptor {
  return value as InputDescriptor;
}

function versionFromSchema(input: InputDescriptor): DescriptorVersion {
  if (typeof input.$schema === 'string') {
    if (/erc7730-v1(?=[.\-_]|\/|$|\.schema)/i.test(input.$schema)) {
      return '1';
    }
  }
  return '2';
}

/**
 * Merge includes, inline field `$ref`s, and hash the canonical merged document.
 *
 * `loader` is invoked for each `includes` URI. Filesystem vs fetch is the
 * caller's concern (CLI later, runtime later). Missing includes throw.
 */
export async function resolveDescriptor(
  input: InputDescriptor,
  loader: IncludeLoader
): Promise<ResolvedDescriptor> {
  const validation = validateDescriptor(input);
  const hasIncludes =
    typeof input.includes === 'string'
      ? input.includes.length > 0
      : Array.isArray((input as { includes?: unknown }).includes);

  if (!validation.ok && !hasIncludes) {
    const first = validation.errors[0];
    throw new DescriptorResolveError(
      first ? `${first.path}: ${first.message}` : 'Invalid descriptor',
      first?.path
    );
  }

  const version = validation.ok ? validation.version : versionFromSchema(input);
  const original = cloneJson(validation.ok ? validation.descriptor : input);
  const mergedDoc = await mergeIncludes(original, loader);
  const withRefs = inlineFieldRefs(mergedDoc);
  const merged = lowercaseBindingAddresses(withRefs);
  if (!isPlainObject(merged)) {
    throw new DescriptorResolveError('Merged descriptor is not an object', '/');
  }

  const descriptor = asInputDescriptor(merged);
  return {
    version,
    hash: descriptorHash(descriptor),
    input: original,
    merged: descriptor,
    deployments: readDeployments(descriptor.context),
  };
}

export function createMemoryIncludeLoader(files: Record<string, unknown>): IncludeLoader {
  return {
    async load(ref) {
      if (!(ref in files)) {
        throw new DescriptorResolveError(`Include not found: ${ref}`, '/includes');
      }
      return files[ref];
    },
  };
}
