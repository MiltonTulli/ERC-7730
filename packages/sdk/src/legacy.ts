/**
 * Deprecated values and aliases. Published as `@erc7730/sdk/legacy`.
 * Each export is removed in 1.0.
 */

/** @deprecated Removed in 1.0. Use {@link createClearSigner}. */
export { ClearSigner } from './core/ClearSigner';

/** @deprecated Removed in 1.0. `clearSign()` owns this registry. */
export { sharedClearSignRegistry as getDefaultClearSignRegistry } from './clearSign';

/** @deprecated Removed in 1.0. Use {@link decodeTransaction}. */
export { format } from './decode/compat';

/** @deprecated Removed in 1.0. Use {@link decodeTypedData}. */
export { formatTypedData } from './decode/compat';

/** @deprecated Removed in 1.0. Use {@link createOfficialRegistry}. */
export { Registry } from './registry';

/** @deprecated Removed in 1.0. */
export { decodeCalldata, extractSelector } from './core/decoder';

/** @deprecated Removed in 1.0. */
export { COMMON_SIGNATURES, computeSelector, getSignatureBySelector } from './core/signatures';

/** @deprecated Removed in 1.0. */
export {
  NATIVE_CURRENCY,
  formatAmount,
  getTokenInfo,
  isInfiniteApproval,
} from './formats/tokenAmount';

/** @deprecated Removed in 1.0. */
export { formatAddress, resolveAddress } from './formats/addressName';

/** @deprecated Removed in 1.0. */
export { EIP1967_IMPLEMENTATION_SLOT, resolveImplementation } from './decode/context';

/** @deprecated Removed in 1.0. Pass an {@link IncludeLoader} to {@link resolveDescriptor}. */
export { createMemoryIncludeLoader } from './resolve';

/** @deprecated Removed in 1.0. */
export { isCommitSha } from './official-registry/pin';

/** @deprecated Removed in 1.0. */
export {
  DEFAULT_OFFICIAL_REGISTRY_BASE_URL,
  OFFICIAL_REGISTRY_REPO,
  toCaip10,
} from './official-registry/paths';

/** @deprecated Removed in 1.0. Use {@link DecodeOptions}. */
export type { DecodeOptions as ClearSignerConfig } from './decode/types';

/** @deprecated Removed in 1.0. Use {@link ValidationIssue}. */
export type { ValidationIssue as ValidationError } from './types/descriptor';

import type { InputDescriptor } from './types/descriptor';
import type { DisplayField } from './types/v2';

/** @deprecated Use {@link InputDescriptor}. */
export type ERC7730Descriptor = InputDescriptor;

/** @deprecated Use schema context on {@link InputDescriptor}. */
export type ERC7730Context = NonNullable<InputDescriptor['context']>;

/** @deprecated Use schema metadata on {@link InputDescriptor}. */
export type ERC7730Metadata = NonNullable<InputDescriptor['metadata']>;

/** @deprecated Use schema display on {@link InputDescriptor}. */
export type ERC7730Display = NonNullable<InputDescriptor['display']>;

/** @deprecated Use schema contract binding on {@link InputDescriptor}. */
export type ContractContext = {
  abi?: readonly unknown[];
  deployments?: Array<{ chainId?: number; address?: string }>;
  factory?: {
    deployments: Array<{ chainId?: number; address?: string }>;
    deployEvent: string;
  };
};

/** @deprecated Use schema deployments on {@link InputDescriptor}. */
export interface ContractDeployment {
  chainId: number;
  address: string;
}

/** @deprecated Use {@link InputDescriptor}. */
export type ERC7730V2Descriptor = InputDescriptor;

/** @deprecated Prefer `DisplayField`. */
export type FieldFormatter = DisplayField;

export type {
  AddressNameParams,
  DateParams,
  EnumParams,
  FieldDefinition,
  FormatParams,
  FunctionFormat,
  RegistryFieldFormat,
  TokenAmountParams,
  UnitParams,
} from './registry/signature';
