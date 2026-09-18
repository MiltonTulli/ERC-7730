/**
 * ERC-7730 v2 types derived from specs/erc7730-v2.schema.json.
 * Fields not present in that schema are not declared here.
 */

export type ERC7730V2FieldFormat =
  | 'raw'
  | 'addressName'
  | 'tokenTicker'
  | 'calldata'
  | 'amount'
  | 'tokenAmount'
  | 'nftName'
  | 'date'
  | 'duration'
  | 'unit'
  | 'enum'
  | 'chainId'
  | 'interoperableAddressName';

export interface Deployment {
  chainId?: number;
  address?: string;
}

export interface FactoryConstraint {
  deployments: Deployment[];
  deployEvent: string;
}

export interface ContractBinding {
  abi?: unknown;
  deployments?: Deployment[];
  factory?: FactoryConstraint;
}

export interface EIP712DomainConstraint {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
}

export interface EIP712Binding {
  schemas?: unknown;
  domain?: EIP712DomainConstraint;
  domainSeparator?: string;
  deployments?: Deployment[];
}

export type ERC7730V2Context =
  | { $id?: string; contract: ContractBinding; eip712?: never }
  | { $id?: string; eip712: EIP712Binding; contract?: never };

export interface ERC7730V2OwnerInfo {
  deploymentDate?: string;
  url: string;
}

export interface TokenDescription {
  name: string;
  ticker: string;
  decimals: number;
}

export type ConstantValue = string | number | boolean | null;

export type EnumDefinition = Record<string, string>;

export interface ERC7730V2Metadata {
  owner?: string;
  contractName?: string;
  info?: ERC7730V2OwnerInfo;
  token?: TokenDescription;
  constants?: Record<string, ConstantValue>;
  enums?: Record<string, EnumDefinition>;
}

export type SimpleDisplayRule = 'always' | 'never' | 'optional';

export interface ConditionalDisplayRule {
  ifNotIn?: Array<string | number | boolean | null>;
  mustMatch?: Array<string | number | boolean | null>;
}

export type DisplayRule = SimpleDisplayRule | ConditionalDisplayRule;

export interface MapReference {
  map?: string;
  keyPath?: string;
}

export interface AddressNameParameters {
  types?: Array<'wallet' | 'eoa' | 'contract' | 'token' | 'collection'>;
  sources?: string[];
  senderAddress?: string | string[];
}

export interface InteroperableAddressNameParameters {
  types?: Array<'wallet' | 'eoa' | 'contract' | 'token' | 'collection'>;
  sources?: string[];
  senderAddress?: string | string[];
}

export interface CalldataParameters {
  callee?: string | MapReference;
  calleePath?: string;
  selector?: string | MapReference;
  selectorPath?: string;
  amount?: number | MapReference;
  amountPath?: string;
  spender?: string | MapReference;
  spenderPath?: string;
}

export interface TokenAmountParameters {
  token?: string | MapReference;
  tokenPath?: string;
  nativeCurrencyAddress?: string | string[];
  threshold?: string;
  message?: string;
  chainId?: number | MapReference;
  chainIdPath?: string;
}

export interface TokenTickerParameters {
  chainId?: number | MapReference;
  chainIdPath?: string;
}

export interface NftNameParameters {
  collection?: string | MapReference;
  collectionPath?: string;
}

export interface DateParameters {
  encoding: 'blockheight' | 'timestamp';
}

export interface UnitParameters {
  base: string;
  decimals?: number;
  prefix?: boolean;
}

export interface EnumParameters {
  $ref: string;
}

export interface EncryptionParameters {
  scheme: string;
  plaintextType?: string;
  fallbackLabel?: string;
}

export type FieldParams =
  | AddressNameParameters
  | InteroperableAddressNameParameters
  | CalldataParameters
  | TokenAmountParameters
  | TokenTickerParameters
  | NftNameParameters
  | DateParameters
  | UnitParameters
  | EnumParameters;

export interface DisplayField {
  $id?: string;
  path?: string;
  value?: string | number | boolean;
  visible?: DisplayRule;
  label?: string;
  format?: ERC7730V2FieldFormat;
  separator?: string;
  encryption?: EncryptionParameters;
  params?: FieldParams;
}

export interface FieldGroup {
  $id?: string;
  path?: string;
  label?: string;
  iteration?: 'sequential' | 'bundled';
  fields: DisplayFieldItem[];
}

export interface FieldReference {
  $ref: string;
  path?: string;
  value?: string | number | boolean;
  label?: string;
  params?: Record<string, string>;
  separator?: string;
  visible?: DisplayRule;
  encryption?: EncryptionParameters;
}

export type DisplayFieldItem = DisplayField | FieldGroup | FieldReference;

export type Intent = string | Record<string, string>;

export interface DisplayFormat {
  $id?: string;
  intent?: Intent;
  interpolatedIntent?: string;
  fields?: DisplayFieldItem[];
}

export interface ERC7730V2Display {
  definitions?: Record<string, DisplayField>;
  formats: Record<string, DisplayFormat>;
}

export interface ERC7730V2Descriptor {
  $schema?: string;
  $comment?: string;
  includes?: string;
  context?: ERC7730V2Context;
  metadata?: ERC7730V2Metadata;
  display?: ERC7730V2Display;
}
