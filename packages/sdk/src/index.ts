// `@mergeModuleWith <project>` publishes this entry beside the other modules
// so `/sdk/api/functions/…` has no `index` segment.
/**
 * Decode blockchain transactions into human-readable form using ERC-7730.
 *
 * @packageDocumentation
 * @mergeModuleWith <project>
 *
 * @example
 * ```typescript
 * import { clearSign } from '@erc7730/sdk';
 *
 * const signed = await clearSign({
 *   to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
 *   data: '0xd0e30db0',
 *   value: 10n ** 18n,
 *   chainId: 1,
 * });
 *
 * console.log(signed.screens.headline);
 * console.log(signed.screens.verification);
 * ```
 */

export { Erc7730Error, InvalidInputError } from './errors';
export type { InvalidInputCode } from './errors';

export { createClearSigner } from './core/ClearSigner';
export { clearSign } from './clearSign';
export type { ClearSignInput, ClearSignedBatch, ClearSignedOperation } from './clearSign';
export { renderScreensText, screenVerification, toScreens } from './screens';
export type {
  ClearSignScreens,
  ScreenField,
  ScreenRisk,
  ScreenVerification,
  ToScreensOptions,
} from './screens';

export { validateDescriptor, validateDescriptorTests } from './schema';

export { decodeTransaction } from './decode/decodeTransaction';
export { decodeTypedData } from './decode/decodeTypedData';
export { decodeBatch } from './decode/decodeBatch';
export { decodeUserOp } from './decode/decodeUserOp';
export { matchContext } from './decode/context';
export { SECURITY_WARNING_TYPES } from './decode/types';

export { decodeViemTypedData } from './decode/viemTypedData';

export {
  composePolicies,
  officialOnlyPolicy,
  officialOrLocalPolicy,
  TRUST_REASON_CODES,
} from './trust';

export { resolveDescriptor, descriptorHash, DescriptorResolveError } from './resolve';

export { resolvePath, PathResolveError } from './path';

export {
  createOfficialRegistry,
  createMemoryDescriptorCache,
  OfficialRegistryError,
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
} from './schema';

export type {
  Address as RegistryAddress,
  Caip10,
  DescriptorCache,
  OfficialRegistry,
  OfficialRegistryConfig,
  OfficialRegistryErrorCode,
  RegistryLookupKey,
} from './official-registry';

export type { DescriptorResolveErrorCode } from './resolve';

export type { PathContext, PathEnvelope, PathResolveErrorCode } from './path';

export type {
  BatchDecodeResult,
  BatchInput,
  ChainInfo,
  Confidence,
  ContextMatch,
  ContextMatchVia,
  AddressNameDetails,
  CalldataDetails,
  ClearSignEvent,
  DateDetails,
  DecodedField,
  DecodedOperation,
  DecodeDiagnostic,
  DiagnosticLog,
  DecodeOptions,
  EnumDetails,
  NftNameDetails,
  RawDetails,
  TokenAmountDetails,
  DecodeRegistry,
  DecodeSource,
  ExternalDataProvider,
  FieldFormat,
  MatchContextOptions,
  SecurityWarning,
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

export type { TrustReasonCode } from './trust';

export type {
  PrefetchRegistryIndexOptions,
  PrefetchedRegistryIndexes,
  OfficialRegistryIndexes,
} from './official-registry';

export type {
  LogBlockTag,
  Provider,
  TransactionInput,
  TypedDataInput,
  ERC7730V2Context,
  ERC7730V2Metadata,
  ERC7730V2Display,
  ERC7730V2FieldFormat,
} from './types';
