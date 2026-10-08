/**
 * Rows in the legacy `Registry` signature index.
 * Not the official JSON Schema field model and not the public decode result types.
 */

export type RegistryFieldFormat =
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
  format?: RegistryFieldFormat;
  params?: FormatParams;
}

export interface FunctionFormat {
  intent?: string;
  fields: FieldDefinition[];
  required?: string[];
  excluded?: string[];
}
