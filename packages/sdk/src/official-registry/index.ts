export { createOfficialRegistry } from './create';
export { OfficialRegistryError } from './error';
export type { OfficialRegistryErrorCode } from './error';
export { createMemoryDescriptorCache } from './cache';
export { isCommitSha, resolveRegistryTreeRef } from './pin';
export { toCaip10, DEFAULT_OFFICIAL_REGISTRY_BASE_URL, OFFICIAL_REGISTRY_REPO } from './paths';
export { fetchPrebuiltRegistryIndex } from './prefetch';
export { VENDORED_REGISTRY_COMMIT } from './vendored';

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
