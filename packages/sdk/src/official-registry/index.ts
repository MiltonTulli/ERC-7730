import source from '../schema/official/source.json' with { type: 'json' };

export { createOfficialRegistry } from './create';
export { OfficialRegistryError } from './error';
export { createMemoryDescriptorCache } from './cache';
export { isCommitSha } from './pin';
export { toCaip10, DEFAULT_OFFICIAL_REGISTRY_BASE_URL, OFFICIAL_REGISTRY_REPO } from './paths';
export { fetchPrebuiltRegistryIndex } from './prefetch';

/**
 * Commit of `ethereum/clear-signing-erc7730-registry` from which JSON Schema
 * was vendored. Example pin for tests and docs — not a factory default.
 */
export const VENDORED_REGISTRY_COMMIT = String(source.commit);

export type {
  Address,
  Caip10,
  CalldataIndex,
  DescriptorCache,
  Eip712Index,
  OfficialRegistry,
  OfficialRegistryConfig,
  OfficialRegistryIndexes,
  RegistryLookupKey,
} from './types';

export type {
  PrefetchRegistryIndexOptions,
  PrefetchedRegistryIndexes,
} from './prefetch';
