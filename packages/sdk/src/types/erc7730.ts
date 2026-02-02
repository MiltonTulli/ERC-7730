/**
 * ERC-7730 Type Definitions
 * Based on: https://eips.ethereum.org/EIPS/eip-7730
 */

// ============================================================================
// Context Types
// ============================================================================

export interface ContractDeployment {
  chainId: number;
  address: string;
}

export interface ContractContext {
  abi?: readonly unknown[];
  deployments: ContractDeployment[];
}

export interface EIP712Domain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
}

export interface EIP712Context {
  domain: EIP712Domain;
  schemas: Record<string, unknown>;
}

export interface ERC7730Context {
  $id?: string;
  contract?: ContractContext;
  eip712?: EIP712Context;
}

// ============================================================================
// Metadata Types
// ============================================================================

export interface OwnerInfo {
  legalName?: string;
  url?: string;
}

export interface TokenInfo {
  address: string;
  chainId: number;
  symbol: string;
  decimals: number;
}

export interface ERC7730Metadata {
  owner?: string;
  info?: OwnerInfo;
  token?: TokenInfo;
  constants?: Record<string, unknown>;
  enums?: Record<string, Record<string, string>>;
}

// ============================================================================
// Display Format Types
// ============================================================================

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

export interface TokenAmountParams {
  tokenPath?: string;
  nativeCurrencyAddress?: string[];
  threshold?: string;
  message?: string;
}

export interface AddressNameParams {
  types?: ('eoa' | 'contract' | 'token' | 'nft')[];
  sources?: ('ens' | 'lens' | 'local')[];
}

export interface EnumParams {
  $ref: string;
}

export interface DateParams {
  encoding: 'timestamp' | 'blockheight';
}

export interface UnitParams {
  base: string;
  decimals?: number;
  prefix?: boolean;
}

export type FormatParams =
  | TokenAmountParams
  | AddressNameParams
  | EnumParams
  | DateParams
  | UnitParams;

export interface FieldDefinition {
  path: string;
  label: string;
  format?: FieldFormat;
  params?: FormatParams;
}

export interface FunctionFormat {
  intent?: string;
  fields: FieldDefinition[];
  required?: string[];
  excluded?: string[];
}

export interface ERC7730Display {
  formats: Record<string, FunctionFormat>;
}

// ============================================================================
// Main Descriptor Type
// ============================================================================

export interface ERC7730Descriptor {
  $schema?: string;
  context: ERC7730Context;
  metadata?: ERC7730Metadata;
  display: ERC7730Display;
}

// ============================================================================
// Decoded Result Types
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
  type: 'infinite_approval' | 'unusual_recipient' | 'high_value' | 'unknown_contract' | 'proxy_call';
  severity: 'low' | 'medium' | 'high';
  message: string;
}
