/**
 * @erc7730/sdk/lite
 *
 * Lightweight version without embedded registry.
 * Useful for smaller bundle sizes when you provide your own descriptors.
 *
 * @example
 * ```typescript
 * import { createClearSigner, decodeTransaction } from '@erc7730/sdk/lite';
 *
 * const signer = createClearSigner({ provider, registry });
 * signer.extend(myDescriptors);
 * const result = await signer.decodeTransaction(tx);
 * ```
 */

export { ClearSigner as ClearSignerLite, createClearSigner } from './core/ClearSigner.js';

// Core utilities only (no registry)
export { decodeCalldata, extractSelector } from './core/decoder.js';
export { getSignatureBySelector, COMMON_SIGNATURES } from './core/signatures.js';

// Format utilities
export {
  formatAmount,
  getTokenInfo,
  isInfiniteApproval,
} from './formats/tokenAmount.js';

export {
  resolveAddress,
  formatAddress,
} from './formats/addressName.js';

// Types
export { validateDescriptor } from './schema/index.js';

export {
  decodeTransaction,
  decodeTypedData,
  matchContext,
  resolveImplementation,
  EIP1967_IMPLEMENTATION_SLOT,
} from './decode/index.js';

export {
  composePolicies,
  officialOnlyPolicy,
  officialOrLocalPolicy,
} from './trust/index.js';

export {
  resolveDescriptor,
  descriptorHash,
  createMemoryIncludeLoader,
  DescriptorResolveError,
} from './resolve/index.js';

export { resolvePath, PathResolveError } from './path/index.js';

export {
  createOfficialRegistry,
  createMemoryDescriptorCache,
  OfficialRegistryError,
  isCommitSha,
  toCaip10,
  DEFAULT_OFFICIAL_REGISTRY_BASE_URL,
  OFFICIAL_REGISTRY_REPO,
  VENDORED_REGISTRY_COMMIT,
} from './official-registry/index.js';

export type {
  DescriptorVersion,
  Hex,
  InputDescriptor,
  IncludeLoader,
  ResolvedDescriptor,
  ResolvedDeployment,
  ValidationIssue,
  ValidationResult,
} from './types/descriptor.js';

export type { PathContext, PathEnvelope, PathResolveErrorCode } from './path/index.js';

export type {
  Caip10,
  DescriptorCache,
  OfficialRegistry,
  OfficialRegistryConfig,
  RegistryLookupKey,
} from './official-registry/index.js';

export type {
  Confidence,
  ContextMatch,
  ContextMatchVia,
  DecodedOperation,
  DecodeOptions,
  DecodeRegistry,
  DecodeSource,
  MatchContextOptions,
  TrustContext,
  TrustPolicy,
  TrustReport,
} from './decode/index.js';

export type {
  ClearSignerConfig,
  RegistryConfig,
  LogBlockTag,
  Provider,
  TransactionInput,
  TypedDataInput,
  ERC7730Descriptor,
  ERC7730V2Descriptor,
  DecodedTransaction,
  DecodedField,
  SecurityWarning,
} from './types/index.js';
