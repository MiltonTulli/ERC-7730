import { resolveImplementation } from '../decode/context';
import { isPlainObject } from '../resolve/util';
import type { ResolvedDescriptor } from '../types/descriptor';
import { OfficialRegistryError } from './error';
import { loadJson, resolveOfficial } from './fetchLayer';
import { normalizeAddress, toCaip10 } from './paths';
import { CALLDATA_INDEX, EIP712_INDEX, type OfficialRegistryRuntime } from './runtime';
import type { CalldataIndex, Eip712Index, Eip712IndexEntry, RegistryLookupKey } from './types';

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
    return [...paths][0] ?? null;
  }
  return null;
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

export async function lookupCalldata(
  runtime: OfficialRegistryRuntime,
  key: RegistryLookupKey
): Promise<ResolvedDescriptor | null> {
  const index = (await loadJson(runtime, CALLDATA_INDEX, key.cacheObserver)) as CalldataIndex;
  if (!isPlainObject(index)) {
    throw new OfficialRegistryError('INDEX_MALFORMED', `${CALLDATA_INDEX} is not a JSON object`);
  }
  const direct = await lookupIndexPath(index, key.chainId, key.address);
  if (direct) {
    return resolveOfficial(runtime, direct, key.cacheObserver);
  }

  const impl = await resolveImplementation(normalizeAddress(key.address), key.provider);
  if (impl && impl.toLowerCase() !== normalizeAddress(key.address)) {
    const viaProxy = await lookupIndexPath(index, key.chainId, impl);
    if (viaProxy) {
      return resolveOfficial(runtime, viaProxy, key.cacheObserver);
    }
  }
  // Official `index.calldata.json` is CAIP-10 of `contract.deployments`
  // (plus EIP-1967 / EIP-1167 implementations). There is no factory-clone
  // catalog. Factory-only descriptors match via `extend()` + matchContext.
  return null;
}

export async function lookupEip712(
  runtime: OfficialRegistryRuntime,
  key: RegistryLookupKey
): Promise<ResolvedDescriptor | null> {
  const index = (await loadJson(runtime, EIP712_INDEX, key.cacheObserver)) as Eip712Index;
  if (!isPlainObject(index)) {
    throw new OfficialRegistryError('INDEX_MALFORMED', `${EIP712_INDEX} is not a JSON object`);
  }
  const direct = pickEip712Path(index[toCaip10(key.chainId, key.address)], key);
  if (direct) {
    return resolveOfficial(runtime, direct, key.cacheObserver);
  }

  const impl = await resolveImplementation(normalizeAddress(key.address), key.provider);
  if (impl && impl.toLowerCase() !== normalizeAddress(key.address)) {
    const viaProxy = pickEip712Path(index[toCaip10(key.chainId, impl)], key);
    if (viaProxy) {
      return resolveOfficial(runtime, viaProxy, key.cacheObserver);
    }
  }
  return null;
}
