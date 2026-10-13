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
  };

  function resolveOverride(input: InputDescriptor): Promise<ResolvedDescriptor> {
    let pending = runtime.resolvedOverrides.get(input);
    if (!pending) {
      pending = resolveDescriptor(input, includeLoader(runtime, ''));
      runtime.resolvedOverrides.set(input, pending);
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
