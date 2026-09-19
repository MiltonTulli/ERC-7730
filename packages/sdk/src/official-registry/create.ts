import { matchContext, resolveImplementation } from '../decode/context.js';
import { resolveDescriptor } from '../resolve/resolve.js';
import { isPlainObject } from '../resolve/util.js';
import { validateDescriptor } from '../schema/validate.js';
import type { IncludeLoader, InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';
import { cacheKey, createMemoryDescriptorCache } from './cache.js';
import { OfficialRegistryError } from './error.js';
import {
  DEFAULT_OFFICIAL_REGISTRY_BASE_URL,
  assertSafeRegistryPath,
  normalizeAddress,
  registryFileUrl,
  resolveRegistryPath,
  toCaip10,
} from './paths.js';
import { assertRegistryPin } from './pin.js';
import type {
  CalldataIndex,
  DescriptorCache,
  Eip712Index,
  Eip712IndexEntry,
  OfficialRegistry,
  OfficialRegistryConfig,
  RegistryLookupKey,
} from './types.js';

const CALLDATA_INDEX = 'index.calldata.json';
const EIP712_INDEX = 'index.eip712.json';

function asInputDescriptor(value: unknown, path: string): InputDescriptor {
  if (!isPlainObject(value)) {
    throw new OfficialRegistryError(`Registry file is not a JSON object: ${path}`);
  }
  return value as InputDescriptor;
}

function pickEip712Path(
  byType: Record<string, Eip712IndexEntry[]> | undefined,
  key: RegistryLookupKey
): string | null {
  if (!byType) {
    return null;
  }

  const types = key.signature ? { [key.signature]: byType[key.signature] } : byType;

  const wantHash = key.encodeTypeHash?.toLowerCase();
  const paths = new Set<string>();

  for (const entries of Object.values(types)) {
    if (!entries) {
      continue;
    }
    for (const entry of entries) {
      if (typeof entry.path !== 'string' || !Array.isArray(entry.encodeTypeHashes)) {
        continue;
      }
      if (wantHash) {
        const hit = entry.encodeTypeHashes.some((hash) => hash.toLowerCase() === wantHash);
        if (!hit) {
          continue;
        }
      }
      paths.add(entry.path);
    }
  }

  if (paths.size === 1) {
    return [...paths][0];
  }
  return null;
}

export function createOfficialRegistry(config: OfficialRegistryConfig): OfficialRegistry {
  if (!config || typeof config.pin !== 'string') {
    throw new OfficialRegistryError(
      'createOfficialRegistry requires config.pin to be a 40-character git commit SHA'
    );
  }

  const pin = assertRegistryPin(config.pin);
  const baseUrl = (config.baseUrl ?? DEFAULT_OFFICIAL_REGISTRY_BASE_URL).replace(/\/+$/, '');
  const memory = createMemoryDescriptorCache();
  const durable: DescriptorCache | undefined = config.cache;
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new OfficialRegistryError(
      'createOfficialRegistry needs fetch (pass config.fetch in this runtime)'
    );
  }

  const origins = new WeakMap<object, string>();
  const inflight = new Map<string, Promise<unknown>>();
  const overrides: InputDescriptor[] = [];
  const resolvedOverrides = new Map<InputDescriptor, Promise<ResolvedDescriptor>>();

  async function readCache(key: string): Promise<unknown | undefined> {
    const hot = await memory.get(key);
    if (hot !== undefined) {
      return hot;
    }
    if (!durable) {
      return undefined;
    }
    const stored = await durable.get(key);
    if (stored !== undefined) {
      await memory.set(key, stored);
    }
    return stored;
  }

  async function writeCache(key: string, value: unknown): Promise<void> {
    await memory.set(key, value);
    if (durable) {
      await durable.set(key, value);
    }
  }

  async function loadJson(path: string): Promise<unknown> {
    assertSafeRegistryPath(path);
    const key = cacheKey(pin, path);
    const cached = await readCache(key);
    if (cached !== undefined) {
      return cached;
    }

    const pending = inflight.get(key);
    if (pending) {
      return pending;
    }

    const request = (async () => {
      const url = registryFileUrl(baseUrl, pin, path);
      let response: Response;
      try {
        response = await fetchImpl(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new OfficialRegistryError(`Failed to fetch ${path}: ${message}`);
      }
      if (!response.ok) {
        throw new OfficialRegistryError(
          `Failed to fetch ${path} (${response.status}) from pin ${pin}`
        );
      }
      const json: unknown = await response.json();
      await writeCache(key, json);
      return json;
    })();

    inflight.set(key, request);
    try {
      return await request;
    } finally {
      inflight.delete(key);
    }
  }

  async function loadDescriptor(path: string): Promise<InputDescriptor> {
    const json = asInputDescriptor(await loadJson(path), path);
    origins.set(json, path);
    return json;
  }

  function includeLoader(fallbackPath: string): IncludeLoader {
    return {
      async load(ref, from) {
        // resolveDescriptor clones the input, so WeakMap identity is lost on the
        // first include. Fall back to the file we started resolving.
        const fromPath = origins.get(from as object) ?? fallbackPath;
        const resolved = resolveRegistryPath(fromPath, ref);
        const json = await loadJson(resolved);
        if (isPlainObject(json)) {
          origins.set(json, resolved);
        }
        return json;
      },
    };
  }

  async function resolvePath(path: string): Promise<ResolvedDescriptor> {
    const input = await loadDescriptor(path);
    return resolveDescriptor(input, includeLoader(path));
  }

  async function resolveOverride(input: InputDescriptor): Promise<ResolvedDescriptor> {
    let pending = resolvedOverrides.get(input);
    if (!pending) {
      pending = resolveDescriptor(input, includeLoader(''));
      resolvedOverrides.set(input, pending);
    }
    return pending;
  }

  async function lookupIndexPath(
    index: unknown,
    chainId: number,
    address: string
  ): Promise<string | null> {
    if (!isPlainObject(index)) {
      return null;
    }
    const caip = toCaip10(chainId, address);
    const path = index[caip];
    return typeof path === 'string' ? path : null;
  }

  async function findOverride(key: RegistryLookupKey): Promise<ResolvedDescriptor | null> {
    const address = normalizeAddress(key.address);
    for (const input of overrides) {
      const resolved = await resolveOverride(input);
      if (
        resolved.deployments.some(
          (item) => item.chainId === key.chainId && item.address === address
        )
      ) {
        return resolved;
      }
      const bound = await matchContext(
        resolved,
        { to: address, data: '0x', chainId: key.chainId },
        { provider: key.provider }
      );
      if (bound.matched) {
        return resolved;
      }
    }
    return null;
  }

  return {
    async findCalldata(key) {
      const local = await findOverride(key);
      if (local) {
        return local;
      }

      const index = (await loadJson(CALLDATA_INDEX)) as CalldataIndex;
      if (!isPlainObject(index)) {
        throw new OfficialRegistryError(`${CALLDATA_INDEX} is not a JSON object`);
      }
      const direct = await lookupIndexPath(index, key.chainId, key.address);
      if (direct) {
        return resolvePath(direct);
      }

      const impl = await resolveImplementation(normalizeAddress(key.address), key.provider);
      if (impl && impl.toLowerCase() !== normalizeAddress(key.address)) {
        const viaProxy = await lookupIndexPath(index, key.chainId, impl);
        if (viaProxy) {
          return resolvePath(viaProxy);
        }
      }
      return null;
    },

    async findEip712(key) {
      const local = await findOverride(key);
      if (local) {
        return local;
      }

      const index = (await loadJson(EIP712_INDEX)) as Eip712Index;
      if (!isPlainObject(index)) {
        throw new OfficialRegistryError(`${EIP712_INDEX} is not a JSON object`);
      }
      const direct = pickEip712Path(index[toCaip10(key.chainId, key.address)], key);
      if (direct) {
        return resolvePath(direct);
      }

      const impl = await resolveImplementation(normalizeAddress(key.address), key.provider);
      if (impl && impl.toLowerCase() !== normalizeAddress(key.address)) {
        const viaProxy = pickEip712Path(index[toCaip10(key.chainId, impl)], key);
        if (viaProxy) {
          return resolvePath(viaProxy);
        }
      }
      return null;
    },

    extend(descriptors) {
      for (let i = 0; i < descriptors.length; i++) {
        const descriptor = descriptors[i];
        const validation = validateDescriptor(descriptor);
        const hasIncludes =
          typeof descriptor.includes === 'string' ? descriptor.includes.length > 0 : false;
        if (!validation.ok && !hasIncludes) {
          const details = validation.errors
            .map((error) => `${error.path}: ${error.message}`)
            .join('; ');
          throw new OfficialRegistryError(`Invalid descriptor at index ${i}: ${details}`);
        }
        overrides.push(descriptor);
      }
    },
  };
}
