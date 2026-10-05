/**
 * Generated from packages/sdk/src/schema/official/erc7730-v2.schema.json.
 * DO NOT EDIT. Run `pnpm schema:types` to regenerate.
 */

/**
 * The schema that the document should conform to. This should be the URL of a version of the clear signing JSON schemas available under https://github.com/LedgerHQ/clear-signing-erc7730-registry/tree/master/specs
 */
export type Schema = string;
/**
 * An optional comment string that can be used to document the purpose of the file.
 */
export type Schema1 = string;
/**
 * An URL of another ERC 7730 file that should be merged into this one. Includes are merged into this file before analysis. This can be used to manage interfaces definitions without redundancy.
 */
export type ExternalIncludes = string;
/**
 * The binding context is a set of constraints that are used to bind the ERC7730 file to a specific structured data being displayed. Currently, supported contexts include contract-specific constraints or EIP712 message specific constraints.
 */
export type ERC7730V2Context = ContractContextBranch | EIP712ContextBranch;
/**
 * An internal identifier that can be used either for clarity specifying what the element is or as a reference in device specific sections.
 */
export type ID = string;
/**
 * An array of deployments describing where the contract is deployed. The target contract (Tx to or factory) MUST match one of those deployments.
 */
export type DeploymentList = {
  chainId?: number;
  address?: string;
}[];
/**
 * The event signature that is emitted by the factory when deploying a new contract.
 */
export type DeployEventSignature = string;
/**
 * The domain separator value that must be matched by the message. In hex string representation.
 */
export type DomainSeparatorConstraint = string;
/**
 * An array of deployments describing where the contract is deployed. The target contract (Tx to or factory) MUST match one of those deployments.
 */
export type DeploymentList1 = {
  chainId?: number;
  address?: string;
}[];
/**
 * The display name of the owner or target of the contract / message to be clear signed.
 */
export type OwnerDisplayName = string;
/**
 * The name of the contract targeted by the transaction or message.
 */
export type ContractName = string;
/**
 * The date of deployment of the contract / message.
 */
export type DeploymentDateOfTheContractMessage = string;
/**
 * URL with more info on the entity the user interacts with.
 */
export type OwnerURL = string;
export type TokenName = string;
/**
 * A short capitalized ticker for the token, that will be displayed in front of corresponding amounts.
 */
export type TokenTicker = string;
/**
 * The number of decimals of the token ticker, used to display amounts.
 */
export type TokenDecimals = number;
/**
 * A path to the field in the structured data. The path is a JSON path expression that can be used to extract the field value from the structured data.
 */
export type Path = string;
/**
 * A literal value on which the format should be applied instead of looking up a field in the structured data.
 */
export type Value = string | number | boolean;
/**
 * Specifies when a field should be displayed based on its value or context. Defaults to 'always' if not specified.
 */
export type DisplayRule =
  | ('always' | 'never' | 'optional')
  | {
      /**
       * Display the field only if its value is NOT in this list.
       *
       * @minItems 1
       */
      ifNotIn?: [string | number | boolean | null, ...(string | number | boolean | null)[]];
      /**
       * Always skip display, but value MUST match one of these values.
       *
       * @minItems 1
       */
      mustMatch?: [string | number | boolean | null, ...(string | number | boolean | null)[]];
    };
/**
 * The label of the field, that will be displayed to the user in front of the formatted field value.
 */
export type FieldLabel = string;
/**
 * The format of the field, that will be used to format the field value in a human readable way.
 */
export type ERC7730V2FieldFormat = (
  | RawFormat
  | AddressFormat
  | AddressFormat1
  | BytesFormat
  | IntegerFormat
  | IntegerFormat1
  | IntegerFormat2
  | IntegerFormat3
  | IntegerFormat4
  | IntegerFormat5
  | IntegerFormat6
  | IntegerFormat7
  | IntegerFormat8
) &
  string;
/**
 * The field should be displayed as the natural representation of the underlying structured data type.
 */
export type RawFormat = 'raw';
/**
 * The field should be displayed as a trusted name, or as a raw address if no names are found in trusted sources. List of trusted sources can be optionally specified in parameters.
 */
export type AddressFormat = 'addressName';
/**
 * The field should be displayed as an ERC 20 token ticker, or as a raw address if no token definition are found.
 */
export type AddressFormat1 = 'tokenTicker';
/**
 * The field is itself a calldata embedded in main call. Another ERC 7730 should be used to parse this field. If not available or not supported, the wallet MAY display a hash of the embedded calldata instead.
 */
export type BytesFormat = 'calldata';
/**
 * The field should be displayed as an amount in underlying currency, converted using the best magnitude / ticker available.
 */
export type IntegerFormat = 'amount';
/**
 * The field should be displayed as an amount, preceded by the ticker. The magnitude and ticker should be derived from the token or tokenPath parameter corresponding metadata.
 */
export type IntegerFormat1 = 'tokenAmount';
/**
 * The field should be displayed as a single NFT names, or as a raw token Id if a specific name is not found. Collection is specified by the collection or collectionPath parameter.
 */
export type IntegerFormat2 = 'nftName';
/**
 * The field should be displayed as a date. Suggested RFC3339 representation. Parameter specifies the encoding of the date.
 */
export type IntegerFormat3 = 'date';
/**
 * The field should be displayed as a duration in HH:MM:ss form. Value is interpreted as a number of seconds.
 */
export type IntegerFormat4 = 'duration';
/**
 * The field should be displayed as a percentage. Magnitude of the percentage encoding is specified as a parameter. Example: a value of 3000 with magnitude 4 is displayed as 0.3%.
 */
export type IntegerFormat5 = 'unit';
/**
 * The field should be displayed as a human readable string by converting the value using the enum referenced in parameters.
 */
export type IntegerFormat6 = 'enum';
/**
 * The field should be displayed as a Blockchain explicit name, as defined in EIP-155, based on the chain id value.
 */
export type IntegerFormat7 = 'chainId';
/**
 * The field should be displayed as a trusted name or as an EIP-7930 Interoperable Address human readable format. List of trusted sources can be optionally specified in parameters.
 */
export type IntegerFormat8 = 'interoperableAddressName';
/**
 * An optional separator string that will be used to separate multiple values when the field is an array. A separator use the interpolated string format with one specific parameter {index} replaced by the index of the element in the array.
 */
export type FieldSeparator = string;
export type FieldParams =
  | AddressNamesFormattingParameters
  | InteroperableAddressNamesFormattingParameters
  | EmbeddedCalldataFormattingParameters
  | TokenAmountFormattingParameters
  | TokenTickerFormattingParameters
  | NFTNamesFormattingParameters
  | DateFormattingParameters
  | UnitFormattingParameters
  | EnumFormattingParameters;
/**
 * The types of address to display. Restrict allowable sources of names and MAY lead to additional checks from wallets.
 */
export type AddressType = ('wallet' | 'eoa' | 'contract' | 'token' | 'collection')[];
/**
 * Trusted Sources for names, in order of preferences. Sources values are wallet manufacturer specific, example values are "local" or "ens". See specification for more details on sources values.
 */
export type TrustedSources = string[];
export type SenderAddress = string | string[];
/**
 * The types of address to display. Restrict allowable sources of names and MAY lead to additional checks from wallets.
 */
export type AddressType1 = ('wallet' | 'eoa' | 'contract' | 'token' | 'collection')[];
/**
 * Trusted Sources for names, in order of preferences. Sources values are wallet manufacturer specific, example values are "local" or "ens". See specification for more details on sources values.
 */
export type TrustedSources1 = string[];
export type SenderAddress1 = string | string[];
/**
 * The address of the contract being called by this embedded calldata.
 */
export type CalleeAddress = (string | MapReference) & (((string | MapReference) & string) | (string | MapReference));
/**
 * The path to the address of the contract being called by this embedded calldata.
 */
export type CalleePath = string;
/**
 * The selector being called, if not contained in the calldata. Hex string representation.
 */
export type CalledSelectorOptional = (string | MapReference) &
  (((string | MapReference) & string) | (string | MapReference));
/**
 * The path to the selector being called, if not contained in the calldata.
 */
export type CalledSelectorPathOptional = string;
/**
 * The associated amount in native currency, if the calldata can be associated with a container value.
 */
export type AmountOptional = (number | MapReference) & (((number | MapReference) & number) | (number | MapReference));
/**
 * The path to the associated amount in native currency, if the calldata can be associated with a container value.
 */
export type AmounPathOptional = string;
/**
 * The associated spender, if the calldata can be associated with a container value.
 */
export type SpenderPathOptional = (string | MapReference) &
  (((string | MapReference) & string) | (string | MapReference));
/**
 * The path to the associated spender, if the calldata can be associated with a container value.
 */
export type SpenderPathOptional1 = string;
/**
 * The token address, or a path to a constant in the ERC 7730 file.
 */
export type Token = (string | MapReference) & (((string | MapReference) & string) | (string | MapReference));
/**
 * The path to the token address in the structured data.
 */
export type TokenPath = string;
export type NativeCurrencyAddress = string | string[];
/**
 * The threshold above which the amount should be displayed using the message parameter rather than the real amount.
 */
export type UnlimitedThreshold = string;
/**
 * The message to display when the amount is above the threshold.
 */
export type UnlimitedMessage = string;
/**
 * Optional. The chain on which the token is deployed (constant, or a map reference). When present, the wallet SHOULD resolve token metadata (ticker, decimals) for this chain. Useful for cross-chain swap clear signing where the same token address may refer to different chains.
 */
export type ChainID = (number | MapReference) & (((number | MapReference) & number) | (number | MapReference));
/**
 * Optional. Path to the chain ID in the structured data. When present, the wallet SHOULD resolve token metadata for the chain at this path. Useful for cross-chain swap clear signing.
 */
export type ChainIDPath = string;
/**
 * Optional. The chain on which the token is deployed (constant, or a map reference). When present, the wallet SHOULD resolve the token ticker for this chain. Useful for cross-chain swap clear signing.
 */
export type ChainID1 = (number | MapReference) & (((number | MapReference) & number) | (number | MapReference));
/**
 * Optional. Path to the chain ID in the structured data. When present, the wallet SHOULD resolve the token ticker for the chain at this path. Useful for cross-chain swap clear signing.
 */
export type ChainIDPath1 = string;
/**
 * The collection address, or a path to a constant in the ERC 7730 file.
 */
export type CollectionAddress = (string | MapReference) &
  (((string | MapReference) & string) | (string | MapReference));
/**
 * The path to the collection in the structured data.
 */
export type CollectionPath = string;
/**
 * The encoding of the date.
 */
export type DateEncoding = 'blockheight' | 'timestamp';
/**
 * The base symbol of the unit, displayed after the converted value. It can be an SI unit symbol or acceptable dimensionless symbols like % or bps.
 */
export type UnitBaseSymbol = string;
/**
 * The number of decimals of the value, used to convert to a float.
 */
export type Decimals = number;
/**
 * Whether the value should be converted to a prefixed unit, like k, M, G, etc.
 */
export type Prefix = boolean;
/**
 * The internal path to the enum definition used to convert this value.
 */
export type EnumReference = string;
export type DisplayIntent = SimpleIntentMessage | ComplexIntentMessage;
/**
 * A description of the intent of the structured data signing, that will be displayed to the user.
 */
export type SimpleIntentMessage = string;
/**
 * An optional intent string with embedded field values using {path} interpolation syntax. This provides a dynamic, contextual description by embedding actual transaction/message values directly in the intent string. Wallets should prefer displaying interpolatedIntent when available and fall back to intent if interpolation fails. See the specification for detailed formatting behavior and security considerations.
 */
export type InterpolatedIntentMessage = string;
/**
 * The group label of the field group, that will be displayed to the user in front of the formatted field values.
 */
export type GroupLabel = string;
/**
 * Specifies how iteration over arrays in the group should be handled. Sequential mode displays elements grouped by array, ie arr_0[0] ... arr_0[N] arr_1[0] ... arr_1[M]. Bundled mode displays elements of the arrays grouped by index, ie arr_0[0] arr_1[0] arr_0[1] arr_1[1] ... arr_0[N] arr_1[N]. In bundled mode, all arrays MUST be of the same length.
 */
export type GroupArraysIterationMode = 'sequential' | 'bundled';
/**
 * Specifies when a field should be displayed based on its value or context. Defaults to 'always' if not specified.
 */
export type DisplayRule1 =
  | ('always' | 'never' | 'optional')
  | {
      /**
       * Display the field only if its value is NOT in this list.
       *
       * @minItems 1
       */
      ifNotIn?: [string | number | boolean | null, ...(string | number | boolean | null)[]];
      /**
       * Always skip display, but value MUST match one of these values.
       *
       * @minItems 1
       */
      mustMatch?: [string | number | boolean | null, ...(string | number | boolean | null)[]];
    };
/**
 * An array containing the ordered definitions of fields formats. See the specification for more details.
 */
export type DisplayFieldItemList = (DisplayField | FieldGroup | FieldReference)[];

/**
 * ERC-7730 descriptor document accepted by the official v2 JSON Schema. Top-level sections may be omitted when provided via includes.
 */
export interface InputDescriptor {
  $schema?: Schema;
  $comment?: Schema1;
  includes?: ExternalIncludes;
  context?: ERC7730V2Context;
  metadata?: ERC7730V2Metadata;
  display?: ERC7730V2Display;
}
export interface ContractContextBranch {
  $id?: ID;
  contract: ContractBindingContext;
}
/**
 * The contract binding context is a set constraints that are used to bind the ERC7730 file to a specific smart contract.
 */
export interface ContractBindingContext {
  /**
   * [Deprecated] ABI definition bound to this file. Continue providing it for backward compatibility only; new specs should rely on display formats.
   */
  abi?: {
    [k: string]: unknown | undefined;
  };
  deployments?: DeploymentList;
  factory?: FactoryConstraint;
}
/**
 * A factory constraint is used to check whether the target contract is deployed by a specified factory.
 */
export interface FactoryConstraint {
  deployments: DeploymentList;
  deployEvent: DeployEventSignature;
}
export interface EIP712ContextBranch {
  $id?: ID;
  eip712: EIP712Binding;
}
/**
 * The EIP-712 binding context is a set of constraints that must be verified by the message being signed.
 */
export interface EIP712Binding {
  /**
   * [Deprecated] Schema definition bound to this file. Continue providing it for backward compatibility only; new specs should rely on display formats.
   */
  schemas?: {
    [k: string]: unknown | undefined;
  };
  domain?: EIP712DomainBindingConstraint;
  domainSeparator?: DomainSeparatorConstraint;
  deployments?: DeploymentList1;
}
/**
 * Each value of the domain constraint MUST match the corresponding eip 712 message domain value.
 */
export interface EIP712DomainBindingConstraint {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
}
/**
 * The metadata section contains information about constant values relevant in the scope of the current contract / message (as matched by the `context` section)
 */
export interface ERC7730V2Metadata {
  owner?: OwnerDisplayName;
  contractName?: ContractName;
  info?: ERC7730V2OwnerInfo;
  token?: TokenDescription;
  constants?: ConstantValues;
  enums?: Enums;
}
/**
 * The owner info section contains detailed information about the owner or target of the contract / message to be clear signed.
 */
export interface ERC7730V2OwnerInfo {
  deploymentDate?: DeploymentDateOfTheContractMessage;
  url: OwnerURL;
}
/**
 * A description of an ERC20 token exported by this format, that should be trusted. Not mandatory if the corresponding metadata can be fetched from the contract itself.
 */
export interface TokenDescription {
  name: TokenName;
  ticker: TokenTicker;
  decimals: TokenDecimals;
}
/**
 * A set of values that can be used in format parameters. Can be referenced with a path expression like $.metadata.constants.CONSTANT_NAME
 */
export interface ConstantValues {
  [k: string]: (string | number | boolean | null) | undefined;
}
/**
 * A set of enums that are used to format fields replacing values with human readable strings.
 */
export interface Enums {
  [k: string]: Enumeration | undefined;
}
/**
 * A set of values that will be used to replace a field value with a human readable string. Enumeration keys are the field values and enumeration values are the displayable strings
 */
export interface Enumeration {
  [k: string]: string | undefined;
}
/**
 * The display section contains all the information needed to format the data in a human readable way. It contains the constants and formatters used to display the data contained in the bound structure.
 */
export interface ERC7730V2Display {
  definitions?: CommonFormatterDefinitions;
  formats: ListOfFieldFormats;
}
/**
 * A set of definitions that can be used to share formatting information between multiple messages / functions. The definitions can be referenced by the key name in an internal path.
 */
export interface CommonFormatterDefinitions {
  [k: string]: DisplayField | undefined;
}
/**
 * A field formatter contains formatting information of a single field in a message.
 */
export interface DisplayField {
  $id?: ID;
  path?: Path;
  value?: Value;
  visible?: DisplayRule;
  label?: FieldLabel;
  format?: ERC7730V2FieldFormat;
  separator?: FieldSeparator;
  encryption?: EncryptionParameters;
  params?: FieldParams;
}
/**
 * If present, the field value is encrypted. The format specifies how to display the decrypted value.
 */
export interface EncryptionParameters {
  /**
   * The encryption scheme used to produce the handle.
   */
  scheme: string;
  /**
   * Solidity type of the decrypted value (the handle does not encode this).
   */
  plaintextType?: string;
  /**
   * Optional label to display when decryption is not possible. Defaults to "[Encrypted]".
   */
  fallbackLabel?: string;
}
export interface AddressNamesFormattingParameters {
  types?: AddressType;
  sources?: TrustedSources;
  senderAddress?: SenderAddress;
}
export interface InteroperableAddressNamesFormattingParameters {
  types?: AddressType1;
  sources?: TrustedSources1;
  senderAddress?: SenderAddress1;
}
export interface EmbeddedCalldataFormattingParameters {
  callee?: CalleeAddress;
  calleePath?: CalleePath;
  selector?: CalledSelectorOptional;
  selectorPath?: CalledSelectorPathOptional;
  amount?: AmountOptional;
  amountPath?: AmounPathOptional;
  spender?: SpenderPathOptional;
  spenderPath?: SpenderPathOptional1;
}
export interface MapReference {
  /**
   * The path to the referenced map.
   */
  map?: string;
  /**
   * The path to the key used to resolve a value using the referenced map.
   */
  keyPath?: string;
}
export interface TokenAmountFormattingParameters {
  token?: Token;
  tokenPath?: TokenPath;
  nativeCurrencyAddress?: NativeCurrencyAddress;
  threshold?: UnlimitedThreshold;
  message?: UnlimitedMessage;
  chainId?: ChainID;
  chainIdPath?: ChainIDPath;
}
export interface TokenTickerFormattingParameters {
  chainId?: ChainID1;
  chainIdPath?: ChainIDPath1;
}
export interface NFTNamesFormattingParameters {
  collection?: CollectionAddress;
  collectionPath?: CollectionPath;
}
export interface DateFormattingParameters {
  encoding: DateEncoding;
}
export interface UnitFormattingParameters {
  base: UnitBaseSymbol;
  decimals?: Decimals;
  prefix?: Prefix;
}
export interface EnumFormattingParameters {
  $ref: EnumReference;
}
/**
 * The list includes formatting info for each field of a structure. For contract bindings, entries are keyed by the full function signature with parameter names; for EIP712 bindings, entries are keyed by the string returned by EIP 712 encodeType on the primary type.
 */
export interface ListOfFieldFormats {
  [k: string]: AStructuredDataFormatSpecification | undefined;
}
/**
 * A structured data format specification contains formatting information of fields in a single type of message.
 */
export interface AStructuredDataFormatSpecification {
  $id?: ID;
  intent?: DisplayIntent;
  interpolatedIntent?: InterpolatedIntentMessage;
  fields?: DisplayFieldItemList;
}
/**
 * A description of the intent of the structured data signing, that will be displayed to the user.
 */
export interface ComplexIntentMessage {
  [k: string]: string | undefined;
}
/**
 * A set of field formats used to group whole definitions for structures for instance. This allows nesting definitions of formats, but note that support for deep nesting will be device dependent.
 */
export interface FieldGroup {
  $id?: ID;
  path?: Path;
  label?: GroupLabel;
  iteration?: GroupArraysIterationMode;
  fields: DisplayFieldItemList;
}
/**
 * A reference to a shared definition that should be used as the field formatting definition. The value is the key in the display definitions section, as a path expression $.display.definitions.DEFINITION_NAME. It is used to share definitions between multiple messages / functions.
 */
export interface FieldReference {
  path?: Path;
  value?: Value;
  /**
   * This value overrides the label in the referenced definition if set.
   */
  label?: string;
  /**
   * An internal definition that should be used as the field formatting definition. The value is the key in the display definitions section, as a path expression $.display.definitions.DEFINITION_NAME.
   */
  $ref: string;
  /**
   * Parameters override. These values takes precedence over the ones in the definition itself
   */
  params?: {
    [k: string]: string | undefined;
  };
  /**
   * Separator override for the referenced definition.
   */
  separator?: string;
  visible?: DisplayRule1;
  encryption?: EncryptionParameters1;
}
/**
 * Encryption override for the referenced definition.
 */
export interface EncryptionParameters1 {
  /**
   * The encryption scheme used to produce the handle.
   */
  scheme: string;
  /**
   * Solidity type of the decrypted value (the handle does not encode this).
   */
  plaintextType?: string;
  /**
   * Optional label to display when decryption is not possible. Defaults to "[Encrypted]".
   */
  fallbackLabel?: string;
}
