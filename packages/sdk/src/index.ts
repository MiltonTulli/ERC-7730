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

export { ClearSigner, createClearSigner } from './core/ClearSigner.js';

// Core utilities
export { decodeCalldata, extractSelector } from './core/decoder.js';
export {
  getSignatureBySelector,
  COMMON_SIGNATURES,
  registerSignature,
  registerSignatures,
  computeSelector,
  clearCustomSignatures,
} from './core/signatures.js';

// Format utilities
export {
  formatAmount,
  getTokenInfo,
  isInfiniteApproval,
  KNOWN_TOKENS,
  NATIVE_CURRENCY,
} from './formats/tokenAmount.js';

export {
  resolveAddress,
  formatAddress,
  KNOWN_ADDRESSES,
} from './formats/addressName.js';

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
  // Sourcify integration
  fetchFromSourcify,
  isVerifiedOnSourcify,
} from './providers/index.js';

export type {
  SourcifyResult,
  SourcifyMatch,
  SourcifyContractDetails,
} from './providers/index.js';

// Registry
export {
  Registry,
  BUILTIN_DESCRIPTORS,
  ERC20_DESCRIPTOR,
  ERC721_DESCRIPTOR,
  WETH_DESCRIPTOR,
} from './registry/index.js';

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
} from './generate/index.js';

export { validateDescriptor } from './schema/index.js';

export {
  decodeTransaction,
  decodeTypedData,
  matchContext,
  resolveImplementation,
  EIP1967_IMPLEMENTATION_SLOT,
  SECURITY_WARNING_TYPES,
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
  GenerateOptions,
  GenerateInput,
  GeneratedDescriptor,
  ABI,
  ABIFunction,
  ABIParameter,
} from './generate/index.js';

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
} from './schema/index.js';

export type {
  Address as RegistryAddress,
  Caip10,
  DescriptorCache,
  OfficialRegistry,
  OfficialRegistryConfig,
  RegistryLookupKey,
} from './official-registry/index.js';

export type { PathContext, PathEnvelope, PathResolveErrorCode } from './path/index.js';

export type {
  Confidence,
  ContextMatch,
  ContextMatchVia,
  DecodedOperation,
  DecodeOptions,
  DecodeRegistry,
  DecodeSource,
  MatchContextOptions,
  SecurityWarningType,
  TrustContext,
  TrustPolicy,
  TrustReport,
} from './decode/index.js';

/**
 * @deprecated Use {@link DecodeOptions} with {@link createClearSigner}.
 */
export type { DecodeOptions as ClearSignerConfig } from './decode/index.js';

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
} from './types/index.js';
