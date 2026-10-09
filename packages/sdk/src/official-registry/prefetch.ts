import { OfficialRegistryError, registryHttpError } from './error';
import { DEFAULT_OFFICIAL_REGISTRY_BASE_URL, registryFileUrl } from './paths';
import { assertRegistryPin } from './pin';
import type { CalldataIndex, Eip712Index } from './types';

export interface PrefetchRegistryIndexOptions {
  /** Full 40-character git commit SHA. */
  pin: string;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
}

export interface PrefetchedRegistryIndexes {
  calldata: CalldataIndex;
  eip712: Eip712Index;
}

/**
 * Fetch `index.calldata.json` and `index.eip712.json` once at the pinned SHA.
 * The caller owns the returned object (pass it to `createOfficialRegistry({ indexes })`).
 */
export async function fetchPrebuiltRegistryIndex(
  options: PrefetchRegistryIndexOptions
): Promise<PrefetchedRegistryIndexes> {
  if (!options || typeof options.pin !== 'string') {
    throw new OfficialRegistryError(
      'INVALID_PIN',
      'fetchPrebuiltRegistryIndex requires pin to be a 40-character git commit SHA'
    );
  }
  const pin = assertRegistryPin(options.pin);
  const baseUrl = (options.baseUrl ?? DEFAULT_OFFICIAL_REGISTRY_BASE_URL).replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new OfficialRegistryError(
      'REGISTRY_FETCH_FAILED',
      'fetchPrebuiltRegistryIndex needs fetch (pass options.fetch in this runtime)'
    );
  }

  async function load(path: string): Promise<unknown> {
    const url = registryFileUrl(baseUrl, pin, path);
    let response: Response;
    try {
      response = await fetchImpl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OfficialRegistryError(
        'REGISTRY_FETCH_FAILED',
        `Failed to fetch ${path}: ${message}`,
        {
          cause: error,
        }
      );
    }
    if (!response.ok) {
      throw registryHttpError(path, response.status, pin);
    }
    try {
      return await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OfficialRegistryError('INDEX_MALFORMED', `Failed to parse ${path}: ${message}`, {
        cause: error,
      });
    }
  }

  const [calldata, eip712] = await Promise.all([
    load('index.calldata.json'),
    load('index.eip712.json'),
  ]);

  if (!calldata || typeof calldata !== 'object' || Array.isArray(calldata)) {
    throw new OfficialRegistryError('INDEX_MALFORMED', 'index.calldata.json is not a JSON object');
  }
  if (!eip712 || typeof eip712 !== 'object' || Array.isArray(eip712)) {
    throw new OfficialRegistryError('INDEX_MALFORMED', 'index.eip712.json is not a JSON object');
  }

  return {
    calldata: calldata as CalldataIndex,
    eip712: eip712 as Eip712Index,
  };
}
