import type { RegistryCacheObserver } from '../decode/types';
import { resolveDescriptor } from '../resolve/resolve';
import { isPlainObject } from '../resolve/util';
import type { IncludeLoader, InputDescriptor, ResolvedDescriptor } from '../types/descriptor';
import { descriptorCacheKey, readCache, writeCache } from './cacheLayer';
import { OfficialRegistryError, registryHttpError } from './error';
import {
  DEFAULT_OFFICIAL_REGISTRY_BASE_URL,
  OFFICIAL_REGISTRY_REPO,
  assertSafeRegistryPath,
  registryFileUrl,
  resolveRegistryPath,
} from './paths';
import { CALLDATA_INDEX, EIP712_INDEX, GITHUB_API, type OfficialRegistryRuntime } from './runtime';

function asInputDescriptor(value: unknown, path: string): InputDescriptor {
  if (!isPlainObject(value)) {
    throw new OfficialRegistryError(
      'INDEX_MALFORMED',
      `Registry file is not a JSON object: ${path}`
    );
  }
  return value as InputDescriptor;
}

export async function loadJson(
  runtime: OfficialRegistryRuntime,
  path: string,
  observer?: RegistryCacheObserver
): Promise<unknown> {
  assertSafeRegistryPath(path);
  if (path === CALLDATA_INDEX && runtime.options.indexes?.calldata) {
    return runtime.options.indexes.calldata;
  }
  if (path === EIP712_INDEX && runtime.options.indexes?.eip712) {
    return runtime.options.indexes.eip712;
  }

  const key = descriptorCacheKey(runtime, path);
  const cached = await readCache(runtime, key);
  if (cached !== undefined) {
    observer?.hit(path);
    return cached;
  }

  const pending = runtime.inflight.get(key);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const url = registryFileUrl(runtime.baseUrl, runtime.pin, path);
    const started = performance.now();
    let response: Response;
    try {
      response = await runtime.fetchImpl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OfficialRegistryError(
        'REGISTRY_FETCH_FAILED',
        `Failed to fetch ${path}: ${message}`,
        { cause: error }
      );
    }
    if (!response.ok) {
      throw registryHttpError(path, response.status, runtime.pin);
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
    await writeCache(runtime, key, json);
    observer?.fetch(path, performance.now() - started);
    return json;
  })();

  runtime.inflight.set(key, request);
  try {
    return await request;
  } finally {
    runtime.inflight.delete(key);
  }
}

export async function loadDescriptor(
  runtime: OfficialRegistryRuntime,
  path: string,
  observer?: RegistryCacheObserver
): Promise<InputDescriptor> {
  const json = asInputDescriptor(await loadJson(runtime, path, observer), path);
  runtime.origins.set(json, path);
  return json;
}

export function includeLoader(
  runtime: OfficialRegistryRuntime,
  fallbackPath: string,
  observer?: RegistryCacheObserver
): IncludeLoader {
  return {
    async load(ref, from) {
      // resolveDescriptor clones the input, so WeakMap identity is lost on the
      // first include. Fall back to the file we started resolving.
      const fromPath = runtime.origins.get(from as object) ?? fallbackPath;
      const resolved = resolveRegistryPath(fromPath, ref);
      const json = await loadJson(runtime, resolved, observer);
      if (isPlainObject(json)) {
        runtime.origins.set(json, resolved);
      }
      return json;
    },
  };
}

export async function loadAttestations(
  runtime: OfficialRegistryRuntime,
  descriptorPath: string
): Promise<unknown[]> {
  const slash = descriptorPath.lastIndexOf('/');
  if (slash < 0) {
    return [];
  }
  const dir = descriptorPath.slice(0, slash);
  const base = descriptorPath.slice(slash + 1).replace(/\.json$/i, '');
  const sigsDir = `${dir}/sigs`;
  const listKey = descriptorCacheKey(runtime, `${sigsDir}/__listing__`);
  let listing: unknown = await readCache(runtime, listKey);
  if (listing === undefined) {
    // baseUrl is a raw-file prefix, not a GitHub contents API. Listing
    // attestations for a custom mirror is the caller's job.
    if (runtime.baseUrl !== DEFAULT_OFFICIAL_REGISTRY_BASE_URL) {
      throw new OfficialRegistryError(
        'REGISTRY_FETCH_FAILED',
        'attachAttestations lists sigs through the GitHub contents API of the official repo. Pass descriptor.attestations when baseUrl is a custom gateway.'
      );
    }
    const listUrl = `${GITHUB_API}/repos/${OFFICIAL_REGISTRY_REPO}/contents/${sigsDir}?ref=${encodeURIComponent(runtime.pin)}`;
    let response: Response;
    try {
      response = await runtime.fetchImpl(listUrl, {
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
      throw registryHttpError(sigsDir, response.status, runtime.pin);
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
    await writeCache(runtime, listKey, listing);
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
      typeof item.path === 'string' && item.path.length > 0 ? item.path : `${sigsDir}/${item.name}`;
    try {
      out.push(await loadJson(runtime, path));
    } catch {
      // Skip a missing or invalid attestation file.
    }
  }
  return out;
}

export async function resolveOfficial(
  runtime: OfficialRegistryRuntime,
  path: string,
  observer?: RegistryCacheObserver
): Promise<ResolvedDescriptor> {
  const input = await loadDescriptor(runtime, path, observer);
  const resolved = await resolveDescriptor(input, includeLoader(runtime, path, observer));
  const attestations = runtime.options.attachAttestations
    ? await loadAttestations(runtime, path)
    : undefined;
  return {
    ...resolved,
    source: 'official-registry' as const,
    registryPath: path,
    ...(attestations && attestations.length > 0 ? { attestations } : {}),
  };
}
