/**
 * Deprecated descriptor aliases. Not part of the package root.
 * RM-24 (#113) is what publishes this module as `@erc7730/sdk/legacy`.
 */

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
