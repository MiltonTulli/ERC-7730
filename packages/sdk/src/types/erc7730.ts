/**
 * Legacy ClearSigner result types and embed-adapter display shapes.
 *
 * The sole schema input model is {@link InputDescriptor} (see `descriptor.ts` /
 * generated v2 types). `ERC7730Descriptor` remains a deprecated alias for one
 * minor. `FunctionFormat` / `FieldDefinition` describe the normalized embed
 * catalog used by the v1 `Registry` class — not the official JSON Schema.
 */

import type { InputDescriptor } from './descriptor';

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

/**
 * Formats recognized when adapting the minified embed catalog into the legacy
 * `Registry` index. Not the full official v2 format enum.
 *
 * @deprecated Prefer {@link import('./v2').ERC7730V2FieldFormat}.
 */
export type FieldFormat =
  | 'raw'
  | 'addressName'
  | 'tokenAmount'
  | 'nftName'
  | 'date'
  | 'enum'
  | 'calldata'
  | 'duration'
  | 'unit';

/** @deprecated Embed-adapter params; prefer schema `FieldParams`. */
export interface TokenAmountParams {
  tokenPath?: string;
  nativeCurrencyAddress?: string[];
  threshold?: string;
  message?: string;
}

/** @deprecated Embed-adapter params; prefer schema `FieldParams`. */
export interface AddressNameParams {
  types?: ('eoa' | 'contract' | 'token' | 'nft')[];
  sources?: ('ens' | 'lens' | 'local')[];
}

/** @deprecated Embed-adapter params; prefer schema `FieldParams`. */
export interface EnumParams {
  $ref: string;
}

/** @deprecated Embed-adapter params; prefer schema `FieldParams`. */
export interface DateParams {
  encoding: 'timestamp' | 'blockheight';
}

/** @deprecated Embed-adapter params; prefer schema `FieldParams`. */
export interface UnitParams {
  base: string;
  decimals?: number;
  prefix?: boolean;
}

/** @deprecated Embed-adapter params; prefer schema `FieldParams`. */
export type FormatParams =
  | TokenAmountParams
  | AddressNameParams
  | EnumParams
  | DateParams
  | UnitParams;

/**
 * Normalized field row used by the embed → `Registry` adapter.
 * Retains v1 `required`/`excluded` companions on {@link FunctionFormat}.
 *
 * @deprecated Not the official schema field shape; see `DisplayField` in `./v2`.
 */
export interface FieldDefinition {
  path: string;
  label: string;
  format?: FieldFormat;
  params?: FormatParams;
}

/**
 * Normalized function format used by the embed → `Registry` adapter.
 * `required` / `excluded` are v1 display companions, not v2 schema fields.
 *
 * @deprecated Not the official schema format shape; see `DisplayFormat` in `./v2`.
 */
export interface FunctionFormat {
  intent?: string;
  fields: FieldDefinition[];
  required?: string[];
  excluded?: string[];
}

// ============================================================================
// Decoded Result Types (ClearSigner v1 surface)
// ============================================================================

export interface DecodedField {
  label: string;
  value: string;
  rawValue: unknown;
  path: string;
  format?: FieldFormat;
}

export interface DecodedTransaction {
  /** Confidence level of the decoding */
  confidence: 'high' | 'medium' | 'low';

  /** Source of the decoding */
  source: 'registry' | 'sourcify' | 'inferred' | 'basic';

  /** Human-readable intent (e.g., "Send tokens", "Swap") */
  intent: string;

  /** Function name */
  functionName: string;

  /** Function signature */
  signature: string;

  /** Decoded and formatted fields */
  fields: DecodedField[];

  /** Security warnings */
  warnings: SecurityWarning[];

  /** Protocol/contract metadata */
  metadata: {
    protocol?: string;
    contractName?: string;
    chainId: number;
    contractAddress: string;
  };

  /** Raw decoded data */
  raw: {
    selector: string;
    args: readonly unknown[];
  };
}

export interface SecurityWarning {
  type:
    | 'infinite_approval'
    | 'unusual_recipient'
    | 'high_value'
    | 'unknown_contract'
    | 'proxy_call';
  severity: 'low' | 'medium' | 'high';
  message: string;
}
