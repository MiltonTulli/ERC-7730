import source from '../schema/official/source.json' with { type: 'json' };

export { createOfficialRegistry } from './create.js';
export { OfficialRegistryError } from './error.js';
export { createMemoryDescriptorCache } from './cache.js';
export { isCommitSha } from './pin.js';
export { toCaip10, DEFAULT_OFFICIAL_REGISTRY_BASE_URL, OFFICIAL_REGISTRY_REPO } from './paths.js';

/**
 * Commit of `ethereum/clear-signing-erc7730-registry` from which JSON Schema
 * was vendored. Example pin for tests and docs — not a factory default.
 */
export const VENDORED_REGISTRY_COMMIT = String(source.commit);

export type {
  Address,
  Caip10,
  DescriptorCache,
  OfficialRegistry,
  OfficialRegistryConfig,
  RegistryLookupKey,
} from './types.js';
