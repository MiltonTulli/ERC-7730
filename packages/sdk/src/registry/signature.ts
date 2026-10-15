/**
 * Rows in the legacy `Registry` signature index.
 * Not the official JSON Schema field model and not the public decode result types.
 */

/** Format name on one row of the legacy signature index. */
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

/** Parameters for a legacy `tokenAmount` field. */
export interface TokenAmountParams {
  tokenPath?: string;
  nativeCurrencyAddress?: string[];
  threshold?: string;
  message?: string;
}

/** Parameters for a legacy `addressName` field. */
export interface AddressNameParams {
  types?: ('eoa' | 'contract' | 'token' | 'nft')[];
  sources?: ('ens' | 'lens' | 'local')[];
}

/** `$ref` of the enum used by a legacy `enum` field. */
export interface EnumParams {
  $ref: string;
}

/** How a legacy `date` field encodes its value. */
export interface DateParams {
  encoding: 'timestamp' | 'blockheight';
}

/** Base unit, decimals, and prefix flag for a legacy `unit` field. */
export interface UnitParams {
  base: string;
  decimals?: number;
  prefix?: boolean;
}

/** Parameter object stored on a legacy {@link FieldDefinition}. */
export type FormatParams =
  | TokenAmountParams
  | AddressNameParams
  | EnumParams
  | DateParams
  | UnitParams;

/** One displayed field in a legacy function format. */
export interface FieldDefinition {
  path: string;
  label: string;
  format?: RegistryFieldFormat;
  params?: FormatParams;
}

/** Intent and fields for one function in the legacy signature index. */
export interface FunctionFormat {
  intent?: string;
  fields: FieldDefinition[];
  required?: string[];
  excluded?: string[];
}
