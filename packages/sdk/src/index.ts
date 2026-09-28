/**
 * @erc7730/sdk
 *
 * Decode blockchain transactions into human-readable format
 * using the ERC-7730 standard.
 *
 * @example
 * ```typescript
 * import { createOfficialRegistry, decodeTransaction, officialOnlyPolicy } from '@erc7730/sdk';
 *
 * const registry = createOfficialRegistry({ pin: '9f37816afde954ff6617fb5baa346133e5af26c5' });
 * const result = await decodeTransaction(tx, { registry, trust: officialOnlyPolicy() });
 *
 * console.log(result.intent);
 * console.log(result.fields);
 * ```
 */

export { ClearSigner, createClearSigner } from './core/ClearSigner';

// Core utilities
export { decodeCalldata, extractSelector } from './core/decoder';
export {
  getSignatureBySelector,
  COMMON_SIGNATURES,
  registerSignature,
  registerSignatures,
  computeSelector,
  clearCustomSignatures,
} from './core/signatures';

// Format utilities
export {
  formatAmount,
  getTokenInfo,
  isInfiniteApproval,
  KNOWN_TOKENS,
  NATIVE_CURRENCY,
} from './formats/tokenAmount';

export {
  resolveAddress,
  formatAddress,
  KNOWN_ADDRESSES,
} from './formats/addressName';

// Provider utilities
export {
  SUPPORTED_CHAINS,
  EXTRA_PUBLIC_RPCS,
  getChain,
  getDefaultRpc,
  getRpcUrls,
  getSupportedChainIds,
  isChainSupported,
  getChainName,
  getBlockExplorer,
  // Sourcify integration. Opt-in: importing this module does not register a loader.
  enableSourcifyAbiLoader,
  fetchFromSourcify,
  isVerifiedOnSourcify,
  sourcifyVerifiedAbiLoader,
} from './providers';

export type {
  SourcifyResult,
  SourcifyMatch,
  SourcifyContractDetails,
} from './providers';

// Registry
export {
  Registry,
  BUILTIN_DESCRIPTORS,
  ERC20_DESCRIPTOR,
  ERC721_DESCRIPTOR,
  WETH_DESCRIPTOR,
} from './registry';

// Descriptor generation
export {
  generateDescriptor,
  generateFunctionDescriptor,
  inferIntent,
  inferFormat,
  inferLabel,
  looksLikeErc20,
  V2_SCHEMA_URI,
  GENERATED_DESCRIPTOR_COMMENT,
} from './generate';

export { validateDescriptor, validateDescriptorTests } from './schema';

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
  SECURITY_WARNING_TYPES,
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
  GenerateOptions,
  GenerateInput,
  GeneratedDescriptor,
  ABI,
  ABIFunction,
  ABIParameter,
} from './generate';

export type {
  DescriptorVersion,
  Hex,
  InputDescriptor,
  IncludeLoader,
  ResolvedDescriptor,
  ResolvedDeployment,
  ValidationIssue,
  ValidationIssue as ValidationError,
  ValidationResult,
} from './schema';

export type {
  Address as RegistryAddress,
  Caip10,
  DescriptorCache,
  OfficialRegistry,
  OfficialRegistryConfig,
  RegistryLookupKey,
} from './official-registry';

export type { PathContext, PathEnvelope, PathResolveErrorCode } from './path';

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
  SecurityWarningType,
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

export type {
  PrefetchRegistryIndexOptions,
  PrefetchedRegistryIndexes,
  OfficialRegistryIndexes,
} from './official-registry';

/**
 * @deprecated Use {@link DecodeOptions} with {@link createClearSigner}.
 */
export type { DecodeOptions as ClearSignerConfig } from './decode';

// Types
export type {
  // Config
  RegistryConfig,
  LogBlockTag,
  Provider,
  TransactionInput,
  TypedDataInput,
  ChainName,
  // ERC-7730 types
  ERC7730Descriptor,
  ERC7730Context,
  ERC7730Metadata,
  ERC7730Display,
  ContractContext,
  ContractDeployment,
  FunctionFormat,
  FieldDefinition,
  FieldFormat,
  ERC7730V2Descriptor,
  ERC7730V2Context,
  ERC7730V2Metadata,
  ERC7730V2Display,
  ERC7730V2FieldFormat,
  // Result types
  DecodedTransaction,
  DecodedField,
  SecurityWarning,
} from './types';
