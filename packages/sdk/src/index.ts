/**
 * @erc7730/sdk
 *
 * Decode blockchain transactions into human-readable format
 * using the ERC-7730 standard.
 *
 * @example
 * ```typescript
 * import { ClearSigner } from '@erc7730/sdk';
 *
 * // Works out of the box with public RPCs (no config needed!)
 * const signer = new ClearSigner();
 *
 * const result = await signer.decode({
 *   to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
 *   data: '0xa9059cbb...',
 *   chainId: 1
 * });
 *
 * console.log(result.intent);  // "Send tokens"
 * console.log(result.fields);  // [{ label: "Amount", value: "100 USDC" }, ...]
 * ```
 */

// Main class
export { ClearSigner } from './core/ClearSigner.js';

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
  validateDescriptor,
  inferIntent,
  inferFormat,
  inferLabel,
} from './generate/index.js';

export type {
  GenerateOptions,
  ABI,
  ABIFunction,
  ABIParameter,
  ValidationResult,
  ValidationError,
} from './generate/index.js';

// Types
export type {
  // Config
  ClearSignerConfig,
  RegistryConfig,
  Provider,
  TransactionInput,
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
  // Result types
  DecodedTransaction,
  DecodedField,
  SecurityWarning,
} from './types/index.js';
