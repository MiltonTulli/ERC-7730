/**
 * Local ERC-7730 registry.
 *
 * Built-in ERC-20, ERC-721, and WETH descriptors, plus caller overrides.
 * Protocol lookup is `createOfficialRegistry()`, not a bundled catalog.
 */

import { computeSelector } from '../core/signatures';
import { canonicalizeDeclaration } from '../decode/abi';
import { Erc7730Error } from '../errors';
import { type ValidationResult, validateDescriptor } from '../schema';
import type { InputDescriptor } from '../types/descriptor';
import { ERC20_DESCRIPTOR } from './erc20';
import { ERC721_DESCRIPTOR } from './erc721';
import type { FunctionFormat } from './signature';
import { WETH_DESCRIPTOR } from './weth';

function descriptorMatchesAddress(
  descriptor: InputDescriptor,
  chainId: number,
  normalizedAddress: string
): boolean {
  const context = descriptor.context;
  if (!context || !('contract' in context) || !context.contract) {
    return false;
  }
  for (const deployment of context.contract.deployments ?? []) {
    if (
      deployment.chainId === chainId &&
      typeof deployment.address === 'string' &&
      deployment.address.toLowerCase() === normalizedAddress
    ) {
      return true;
    }
  }
  return false;
}

// Built-in descriptors for common standards
// These are always available and serve as fallbacks
// Order matters! For signature collisions, first match wins.
export const BUILTIN_DESCRIPTORS: InputDescriptor[] = [
  WETH_DESCRIPTOR, // Specific contract, should be checked first
  ERC20_DESCRIPTOR, // Most common standard
  ERC721_DESCRIPTOR, // NFT standard (has signature collisions with ERC20)
];

// Index by function signature for fast lookup
type SignatureIndex = Map<string, { descriptor: InputDescriptor; format: FunctionFormat }>;

let signatureIndex: SignatureIndex | null = null;

function buildSignatureIndex(): SignatureIndex {
  const index: SignatureIndex = new Map();

  for (const descriptor of BUILTIN_DESCRIPTORS) {
    const formats = descriptor.display?.formats;
    if (!formats) {
      continue;
    }
    for (const [signature, format] of Object.entries(formats)) {
      const normalized = canonicalizeDeclaration(signature);
      // First match wins - don't overwrite if already exists
      if (!index.has(normalized)) {
        index.set(normalized, {
          descriptor,
          format: format as FunctionFormat,
        });
      }
    }
  }

  return index;
}

export interface RegistryMatch {
  descriptor: InputDescriptor;
  format: FunctionFormat;
}

/**
 * Registry class for managing ERC-7730 descriptors
 */
export class Registry {
  private customDescriptors: InputDescriptor[] = [];
  private customIndex: SignatureIndex = new Map();

  constructor(options: { useExternalRegistry?: never } = {}) {
    if ('useExternalRegistry' in options) {
      throw new Erc7730Error(
        'USE_EXTERNAL_REGISTRY_REMOVED',
        'useExternalRegistry was removed. Look up descriptors with createOfficialRegistry(), or pass indexes and cache for offline use.'
      );
    }
  }

  /**
   * Find descriptor for a function signature or selector
   */
  find(signature: string): RegistryMatch | null {
    const normalized = canonicalizeDeclaration(signature);

    const custom = this.customIndex.get(normalized);
    if (custom) {
      return custom;
    }

    if (!signatureIndex) {
      signatureIndex = buildSignatureIndex();
    }

    return signatureIndex.get(normalized) || null;
  }

  /**
   * Find descriptor by contract address and chain
   */
  findByAddress(address: string, chainId: number): InputDescriptor | null {
    const normalizedAddress = address.toLowerCase();

    for (const descriptor of this.customDescriptors) {
      if (descriptorMatchesAddress(descriptor, chainId, normalizedAddress)) {
        return descriptor;
      }
    }

    for (const descriptor of BUILTIN_DESCRIPTORS) {
      if (descriptorMatchesAddress(descriptor, chainId, normalizedAddress)) {
        return descriptor;
      }
    }

    return null;
  }

  /**
   * Add custom descriptors
   * Validates each descriptor and skips invalid ones with a console warning
   *
   * @returns Array of validation results for each descriptor
   */
  extend(descriptors: InputDescriptor | InputDescriptor[]): ValidationResult[] {
    const toAdd = Array.isArray(descriptors) ? descriptors : [descriptors];
    const results: ValidationResult[] = [];

    for (let i = 0; i < toAdd.length; i++) {
      const descriptor = toAdd[i];

      // Validate descriptor
      const validation = validateDescriptor(descriptor);
      results.push(validation);

      if (!validation.ok) {
        const errorMessages = validation.errors
          .map((e) => `  - ${e.path}: ${e.message}`)
          .join('\n');
        console.error(
          `[ERC7730 SDK] Invalid descriptor at index ${i}, skipping:\n${errorMessages}`
        );
        continue;
      }

      // Add valid descriptor
      this.customDescriptors.push(descriptor);

      const formats = descriptor.display?.formats;
      if (!formats) {
        continue;
      }

      // Index by signature and register with decoder
      for (const [signature, rawFormat] of Object.entries(formats)) {
        const format = rawFormat as FunctionFormat;
        const normalized = canonicalizeDeclaration(signature);
        this.customIndex.set(normalized, { descriptor, format });

        // Index by selector so lookup does not depend on a process-wide signature map.
        if (!signature.startsWith('0x')) {
          const selector = computeSelector(signature);
          this.customIndex.set(selector, { descriptor, format });
        }
      }
    }

    return results;
  }
}

export { ERC20_DESCRIPTOR, ERC721_DESCRIPTOR, WETH_DESCRIPTOR };
