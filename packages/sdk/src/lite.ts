/**
 * @erc7730/sdk/lite
 *
 * Lightweight version without embedded registry.
 * Useful for smaller bundle sizes when you provide your own descriptors.
 *
 * @example
 * ```typescript
 * import { ClearSignerLite } from '@erc7730/sdk/lite';
 * import myDescriptors from './my-descriptors.json';
 *
 * const signer = new ClearSignerLite({ provider });
 * signer.extend(myDescriptors);
 *
 * const result = await signer.decode(tx);
 * ```
 */

// Re-export ClearSigner as ClearSignerLite
// In future, this could be a stripped-down version without built-in registry
export { ClearSigner as ClearSignerLite } from './core/ClearSigner.js';

// Core utilities only (no registry)
export { decodeCalldata, extractSelector } from './core/decoder.js';
export { getSignatureBySelector, COMMON_SIGNATURES } from './core/signatures.js';

// Format utilities
export {
  formatAmount,
  getTokenInfo,
  isInfiniteApproval,
} from './formats/tokenAmount.js';

export {
  resolveAddress,
  formatAddress,
} from './formats/addressName.js';

// Types
export type {
  ClearSignerConfig,
  RegistryConfig,
  Provider,
  TransactionInput,
  ERC7730Descriptor,
  DecodedTransaction,
  DecodedField,
  SecurityWarning,
} from './types/index.js';
