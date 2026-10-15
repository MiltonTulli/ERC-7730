import { invalidDescriptors } from '../resolve/error';
import { resolveDescriptor } from '../resolve/resolve';
import { validateDescriptor } from '../schema/validate';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor';
import { createMemoryDescriptorCache } from './cache';
import { OfficialRegistryError } from './error';
import { includeLoader } from './fetchLayer';
import { lookupCalldata, lookupEip712 } from './lookup';
import { findOverride } from './overrides';
import { DEFAULT_OFFICIAL_REGISTRY_BASE_URL, normalizeAddress } from './paths';
import { isCommitSha, resolveRegistryTreeRef } from './pin';
import type { OfficialRegistryRuntime } from './runtime';
import type { OfficialRegistry, OfficialRegistryConfig, RegistryLookupKey } from './types';

/**
 * Registry client for the Ethereum clear-signing catalog.
 *
 * Omit `pin` and `ref` to use {@link VENDORED_REGISTRY_COMMIT}. Pass `pin` for
 * a commit SHA. Pass `ref` only for a local floating branch or tag.
 *
 * @example
 * ```ts
 * import { createOfficialRegistry } from '@erc7730/sdk';
 *
 * const registry = createOfficialRegistry();
 * ```
 *
 * @throws {@link OfficialRegistryError} `INVALID_PIN` or `INVALID_REF` when
 * `pin` and `ref` are both set or not usable, and `REGISTRY_FETCH_FAILED`
 * when this runtime has no `fetch`.
 */
export function createOfficialRegistry(config: OfficialRegistryConfig = {}): OfficialRegistry {
  const options = config ?? {};
  const pin = resolveRegistryTreeRef(options);
  // Commit SHAs are immutable; branch/tag refs can move. Do not treat floating
  // trees as durable cache keys across fetches or registry instances.
  const cacheable = isCommitSha(pin);
  const baseUrl = (options.baseUrl ?? DEFAULT_OFFICIAL_REGISTRY_BASE_URL).replace(/\/+$/, '');
  const memory = createMemoryDescriptorCache();
  const durable = options.cache;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new OfficialRegistryError(
      'REGISTRY_FETCH_FAILED',
      'createOfficialRegistry needs fetch (pass config.fetch in this runtime)'
    );
  }

  const runtime: OfficialRegistryRuntime = {
    options,
    pin,
    cacheable,
    baseUrl,
    memory,
    durable,
    fetchImpl,
    origins: new WeakMap(),
    inflight: new Map(),
    overrides: [],
    resolvedOverrides: new Map(),
    resolved: new Map(),
  };

  function resolveOverride(input: InputDescriptor): Promise<ResolvedDescriptor> {
    let pending = runtime.resolvedOverrides.get(input);
    if (!pending) {
      const created = resolveDescriptor(input, includeLoader(runtime, ''));
      runtime.resolvedOverrides.set(input, created);
      // Drop failures so a later lookup retries the include fetch.
      created.catch(() => {
        if (runtime.resolvedOverrides.get(input) === created) {
          runtime.resolvedOverrides.delete(input);
        }
      });
      pending = created;
    }
    return pending;
  }

  function checkedKey(key: RegistryLookupKey): RegistryLookupKey {
    return { ...key, address: normalizeAddress(key.address) };
  }

  return {
    async findCalldata(key) {
      const normalized = checkedKey(key);
      const local = await findOverride(runtime.overrides, resolveOverride, normalized, 'calldata');
      if (local) {
        return { ...local, source: 'local-override' as const };
      }
      return lookupCalldata(runtime, normalized);
    },

    async findEip712(key) {
      const normalized = checkedKey(key);
      const local = await findOverride(runtime.overrides, resolveOverride, normalized, 'eip712');
      if (local) {
        return { ...local, source: 'local-override' as const };
      }
      return lookupEip712(runtime, normalized);
    },

    extend(descriptors) {
      for (let i = 0; i < descriptors.length; i++) {
        const descriptor = descriptors[i];
        const validation = validateDescriptor(descriptor);
        const hasIncludes =
          typeof descriptor.includes === 'string' ? descriptor.includes.length > 0 : false;
        if (!validation.ok && !hasIncludes) {
          throw invalidDescriptors(i, validation.errors);
        }
        runtime.overrides.push(descriptor);
      }
    },
  };
}
