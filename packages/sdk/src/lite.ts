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

export { ClearSigner as ClearSignerLite, createClearSigner } from './core/ClearSigner';

// Core utilities only (no registry)
export { decodeCalldata, extractSelector } from './core/decoder';
export { getSignatureBySelector, COMMON_SIGNATURES } from './core/signatures';

// Format utilities
export {
  formatAmount,
  getTokenInfo,
  isInfiniteApproval,
} from './formats/tokenAmount';

export {
  resolveAddress,
  formatAddress,
} from './formats/addressName';

// Types
export { validateDescriptor } from './schema';

export {
  decodeTransaction,
  decodeTypedData,
  decodeBatch,
  decodeUserOp,
  format,
  formatTypedData,
  matchContext,
  resolveImplementation,
  EIP1967_IMPLEMENTATION_SLOT,
} from './decode';

export {
  composePolicies,
  officialOnlyPolicy,
  officialOrLocalPolicy,
  attestedPolicy,
  ERC8176_SCHEMA_UID,
  EAS_CONTRACT,
  EAS_CHAIN_ID,
  TRUST_REASON_CODES,
} from './trust';

export {
  resolveDescriptor,
  descriptorHash,
  createMemoryIncludeLoader,
  DescriptorResolveError,
} from './resolve';

export { resolvePath, PathResolveError } from './path';

export {
  createOfficialRegistry,
  createMemoryDescriptorCache,
  OfficialRegistryError,
  isCommitSha,
  toCaip10,
  DEFAULT_OFFICIAL_REGISTRY_BASE_URL,
  OFFICIAL_REGISTRY_REPO,
  VENDORED_REGISTRY_COMMIT,
  fetchPrebuiltRegistryIndex,
} from './official-registry';

export type {
  DescriptorVersion,
  Hex,
  InputDescriptor,
  IncludeLoader,
  ResolvedDescriptor,
  ResolvedDeployment,
  ValidationIssue,
  ValidationResult,
} from './types/descriptor';

export type { PathContext, PathEnvelope, PathResolveErrorCode } from './path';

export type {
  Caip10,
  DescriptorCache,
  OfficialRegistry,
  OfficialRegistryConfig,
  OfficialRegistryIndexes,
  PrefetchRegistryIndexOptions,
  PrefetchedRegistryIndexes,
  RegistryLookupKey,
} from './official-registry';

export type {
  BatchDecodeResult,
  BatchInput,
  ChainInfo,
  Confidence,
  ContextMatch,
  ContextMatchVia,
  DecodedOperation,
  DecodeOptions,
  DecodeRegistry,
  DecodeSource,
  ExternalDataProvider,
  MatchContextOptions,
  TokenInfo,
  TrustedTokenStandard,
  TrustedTokens,
  TrustContext,
  TrustPolicy,
  TrustReport,
  UserOpInput,
  VerifiedContractAbi,
} from './decode';

export type { AttestedPolicyConfig, TrustReasonCode } from './trust';

/**
 * @deprecated Use {@link DecodeOptions} with {@link createClearSigner}.
 */
export type { DecodeOptions as ClearSignerConfig } from './decode';

export type {
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
} from './types';
