import { matchContext, resolveImplementation } from '../decode/context';
import { eip712FormatMatchesLookup } from '../decode/match';
import type { RegistryCacheObserver } from '../decode/types';
import { invalidDescriptors } from '../resolve/error';
import { resolveDescriptor } from '../resolve/resolve';
import { isPlainObject } from '../resolve/util';
import { validateDescriptor } from '../schema/validate';
import type { IncludeLoader, InputDescriptor, ResolvedDescriptor } from '../types/descriptor';
import { cacheKey, createMemoryDescriptorCache } from './cache';
import { OfficialRegistryError, registryHttpError } from './error';
import {
  DEFAULT_OFFICIAL_REGISTRY_BASE_URL,
  OFFICIAL_REGISTRY_REPO,
  assertSafeRegistryPath,
  normalizeAddress,
  registryFileUrl,
  resolveRegistryPath,
  toCaip10,
} from './paths';
import { isCommitSha, resolveRegistryTreeRef } from './pin';
import type {
  CalldataIndex,
  DescriptorCache,
  Eip712Index,
  Eip712IndexEntry,
  OfficialRegistry,
  OfficialRegistryConfig,
  RegistryLookupKey,
} from './types';

const CALLDATA_INDEX = 'index.calldata.json';
const EIP712_INDEX = 'index.eip712.json';
const GITHUB_API = 'https://api.github.com';

function asInputDescriptor(value: unknown, path: string): InputDescriptor {
  if (!isPlainObject(value)) {
    throw new OfficialRegistryError(
      'INDEX_MALFORMED',
      `Registry file is not a JSON object: ${path}`
    );
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

export function createOfficialRegistry(config: OfficialRegistryConfig = {}): OfficialRegistry {
  const options = config ?? {};
  const pin = resolveRegistryTreeRef(options);
  // Commit SHAs are immutable; branch/tag refs can move. Do not treat floating
  // trees as durable cache keys across fetches or registry instances.
  const cacheable = isCommitSha(pin);
  const baseUrl = (options.baseUrl ?? DEFAULT_OFFICIAL_REGISTRY_BASE_URL).replace(/\/+$/, '');
  const memory = createMemoryDescriptorCache();
  const durable: DescriptorCache | undefined = options.cache;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new OfficialRegistryError(
      'REGISTRY_FETCH_FAILED',
      'createOfficialRegistry needs fetch (pass config.fetch in this runtime)'
    );
  }

  const origins = new WeakMap<object, string>();
  const inflight = new Map<string, Promise<unknown>>();
  const overrides: InputDescriptor[] = [];
  const resolvedOverrides = new Map<InputDescriptor, Promise<ResolvedDescriptor>>();

  async function readCache(key: string): Promise<unknown | undefined> {
    if (!cacheable) {
      return undefined;
    }
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
    if (!cacheable) {
      return;
    }
    await memory.set(key, value);
    if (durable) {
      await durable.set(key, value);
    }
  }

  async function loadJson(path: string, observer?: RegistryCacheObserver): Promise<unknown> {
    assertSafeRegistryPath(path);
    if (path === CALLDATA_INDEX && options.indexes?.calldata) {
      return options.indexes.calldata;
    }
    if (path === EIP712_INDEX && options.indexes?.eip712) {
      return options.indexes.eip712;
    }

    const key = cacheKey(pin, path);
    const cached = await readCache(key);
    if (cached !== undefined) {
      observer?.hit(path);
      return cached;
    }

    const pending = inflight.get(key);
    if (pending) {
      return pending;
    }

    const request = (async () => {
      const url = registryFileUrl(baseUrl, pin, path);
      const started = performance.now();
      let response: Response;
      try {
        response = await fetchImpl(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new OfficialRegistryError(
          'REGISTRY_FETCH_FAILED',
          `Failed to fetch ${path}: ${message}`,
          { cause: error }
        );
      }
      if (!response.ok) {
        throw registryHttpError(path, response.status, pin);
      }
      let json: unknown;
      try {
        json = await response.json();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new OfficialRegistryError('INDEX_MALFORMED', `Failed to parse ${path}: ${message}`, {
          cause: error,
        });
      }
      await writeCache(key, json);
      observer?.fetch(path, performance.now() - started);
      return json;
    })();

    inflight.set(key, request);
    try {
      return await request;
    } finally {
      inflight.delete(key);
    }
  }

  async function loadDescriptor(
    path: string,
    observer?: RegistryCacheObserver
  ): Promise<InputDescriptor> {
    const json = asInputDescriptor(await loadJson(path, observer), path);
    origins.set(json, path);
    return json;
  }

  function includeLoader(fallbackPath: string, observer?: RegistryCacheObserver): IncludeLoader {
    return {
      async load(ref, from) {
        // resolveDescriptor clones the input, so WeakMap identity is lost on the
        // first include. Fall back to the file we started resolving.
        const fromPath = origins.get(from as object) ?? fallbackPath;
        const resolved = resolveRegistryPath(fromPath, ref);
        const json = await loadJson(resolved, observer);
        if (isPlainObject(json)) {
          origins.set(json, resolved);
        }
        return json;
      },
    };
  }

  async function loadAttestations(descriptorPath: string): Promise<unknown[]> {
    const slash = descriptorPath.lastIndexOf('/');
    if (slash < 0) {
      return [];
    }
    const dir = descriptorPath.slice(0, slash);
    const base = descriptorPath.slice(slash + 1).replace(/\.json$/i, '');
    const sigsDir = `${dir}/sigs`;
    const listKey = cacheKey(pin, `${sigsDir}/__listing__`);
    let listing: unknown = await readCache(listKey);
    if (listing === undefined) {
      // baseUrl is a raw-file prefix, not a GitHub contents API. Listing
      // attestations for a custom mirror is the caller's job.
      if (baseUrl !== DEFAULT_OFFICIAL_REGISTRY_BASE_URL) {
        throw new OfficialRegistryError(
          'REGISTRY_FETCH_FAILED',
          'attachAttestations lists sigs through the GitHub contents API of the official repo. Pass descriptor.attestations when baseUrl is a custom gateway.'
        );
      }
      const listUrl = `${GITHUB_API}/repos/${OFFICIAL_REGISTRY_REPO}/contents/${sigsDir}?ref=${encodeURIComponent(pin)}`;
      let response: Response;
      try {
        response = await fetchImpl(listUrl, {
          headers: { Accept: 'application/vnd.github+json' },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new OfficialRegistryError(
          'REGISTRY_FETCH_FAILED',
          `Failed to list ${sigsDir}: ${message}`,
          { cause: error }
        );
      }
      if (response.status === 404) {
        listing = [];
      } else if (!response.ok) {
        throw registryHttpError(sigsDir, response.status, pin);
      } else {
        try {
          listing = await response.json();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new OfficialRegistryError(
            'INDEX_MALFORMED',
            `Failed to parse ${sigsDir} listing: ${message}`,
            { cause: error }
          );
        }
      }
      await writeCache(listKey, listing);
    }
    if (!Array.isArray(listing)) {
      return [];
    }

    const out: unknown[] = [];
    for (const item of listing) {
      if (!isPlainObject(item) || typeof item.name !== 'string') {
        continue;
      }
      if (!item.name.startsWith(`${base}.`) || !item.name.endsWith('.json')) {
        continue;
      }
      const path =
        typeof item.path === 'string' && item.path.length > 0
          ? item.path
          : `${sigsDir}/${item.name}`;
      try {
        out.push(await loadJson(path));
      } catch {
        // Skip a missing or invalid attestation file.
      }
    }
    return out;
  }

  async function resolvePath(
    path: string,
    observer?: RegistryCacheObserver
  ): Promise<ResolvedDescriptor> {
    const input = await loadDescriptor(path, observer);
    return resolveDescriptor(input, includeLoader(path, observer));
  }

  async function resolveOfficial(
    path: string,
    observer?: RegistryCacheObserver
  ): Promise<ResolvedDescriptor> {
    const resolved = await resolvePath(path, observer);
    const attestations = options.attachAttestations ? await loadAttestations(path) : undefined;
    return {
      ...resolved,
      source: 'official-registry' as const,
      registryPath: path,
      ...(attestations && attestations.length > 0 ? { attestations } : {}),
    };
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

  function deploymentsHit(resolved: ResolvedDescriptor, chainId: number, address: string): boolean {
    return resolved.deployments.some(
      (item) => item.chainId === chainId && item.address === address
    );
  }

  function overrideKind(resolved: ResolvedDescriptor): 'calldata' | 'eip712' | null {
    const context = isPlainObject(resolved.merged.context) ? resolved.merged.context : undefined;
    if (!context) {
      return null;
    }
    if (isPlainObject(context.contract)) {
      return 'calldata';
    }
    if (isPlainObject(context.eip712)) {
      return 'eip712';
    }
    return null;
  }

  async function findOverride(
    key: RegistryLookupKey,
    kind: 'calldata' | 'eip712'
  ): Promise<ResolvedDescriptor | null> {
    const address = normalizeAddress(key.address);
    const impl = await resolveImplementation(address, key.provider);
    for (const input of overrides) {
      const resolved = await resolveOverride(input);
      if (overrideKind(resolved) !== kind) {
        continue;
      }
      if (kind === 'eip712' && !eip712FormatMatchesLookup(resolved.merged, key)) {
        continue;
      }
      if (deploymentsHit(resolved, key.chainId, address)) {
        return resolved;
      }
      // EIP-712 overrides are not a contract context; match the implementation
      // address when verifyingContract is a proxy of a listed deployment.
      if (impl && impl !== address && deploymentsHit(resolved, key.chainId, impl)) {
        return resolved;
      }
      const matchOptions = {
        provider: key.provider,
        fromBlock: key.fromBlock,
        toBlock: key.toBlock,
        diagnosticLog: key.diagnosticLog,
      };
      if (kind === 'eip712') {
        if (!key.typedData) {
          continue;
        }
        const bound = await matchContext(resolved, key.typedData, matchOptions);
        if (bound.matched) {
          return resolved;
        }
        continue;
      }
      const bound = await matchContext(
        resolved,
        { to: address, data: '0x', chainId: key.chainId },
        matchOptions
      );
      if (bound.matched) {
        return resolved;
      }
    }
    return null;
  }

  return {
    async findCalldata(key) {
      const local = await findOverride(key, 'calldata');
      if (local) {
        return { ...local, source: 'local-override' as const };
      }

      const index = (await loadJson(CALLDATA_INDEX, key.cacheObserver)) as CalldataIndex;
      if (!isPlainObject(index)) {
        throw new OfficialRegistryError(
          'INDEX_MALFORMED',
          `${CALLDATA_INDEX} is not a JSON object`
        );
      }
      const direct = await lookupIndexPath(index, key.chainId, key.address);
      if (direct) {
        return resolveOfficial(direct, key.cacheObserver);
      }

      const impl = await resolveImplementation(normalizeAddress(key.address), key.provider);
      if (impl && impl.toLowerCase() !== normalizeAddress(key.address)) {
        const viaProxy = await lookupIndexPath(index, key.chainId, impl);
        if (viaProxy) {
          return resolveOfficial(viaProxy, key.cacheObserver);
        }
      }
      // Official `index.calldata.json` is CAIP-10 of `contract.deployments`
      // (plus EIP-1967 / EIP-1167 implementations). There is no factory-clone
      // catalog. Factory-only descriptors match via `extend()` + matchContext.
      return null;
    },

    async findEip712(key) {
      const local = await findOverride(key, 'eip712');
      if (local) {
        return { ...local, source: 'local-override' as const };
      }

      const index = (await loadJson(EIP712_INDEX, key.cacheObserver)) as Eip712Index;
      if (!isPlainObject(index)) {
        throw new OfficialRegistryError('INDEX_MALFORMED', `${EIP712_INDEX} is not a JSON object`);
      }
      const direct = pickEip712Path(index[toCaip10(key.chainId, key.address)], key);
      if (direct) {
        return resolveOfficial(direct, key.cacheObserver);
      }

      const impl = await resolveImplementation(normalizeAddress(key.address), key.provider);
      if (impl && impl.toLowerCase() !== normalizeAddress(key.address)) {
        const viaProxy = pickEip712Path(index[toCaip10(key.chainId, impl)], key);
        if (viaProxy) {
          return resolveOfficial(viaProxy, key.cacheObserver);
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
          throw invalidDescriptors(i, validation.errors);
        }
        overrides.push(descriptor);
      }
    },
  };
}
