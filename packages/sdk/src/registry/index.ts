/**
 * Local ERC-7730 registry.
 *
 * Built-in ERC-20, ERC-721, and WETH descriptors, plus caller overrides.
 * Protocol lookup is `createOfficialRegistry()`, not a bundled catalog.
 */

import { computeSelector, registerSignature } from '../core/signatures';
import { type ValidationResult, validateDescriptor } from '../schema';
import type { InputDescriptor } from '../types/descriptor';
import type { FunctionFormat } from '../types/erc7730';
import { ERC20_DESCRIPTOR } from './erc20';
import { ERC721_DESCRIPTOR } from './erc721';
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
      const normalized = normalizeSignature(signature);
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

/**
 * Normalize function signature to canonical form
 * "transfer(address to, uint256 amount)" -> "transfer(address,uint256)"
 */
function normalizeSignature(signature: string): string {
  // Handle selector format (0x...)
  if (signature.startsWith('0x')) {
    return signature.toLowerCase();
  }

  const match = signature.match(/^(\w+)\((.*)\)$/);
  if (!match) return signature;

  const [, name, params] = match;

  // Parse params and extract only types
  const types = parseParamTypes(params);

  return `${name}(${types.join(',')})`;
}

/**
 * Parse parameter string and extract types only
 */
function parseParamTypes(params: string): string[] {
  if (!params.trim()) return [];

  const types: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of params) {
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (char === ',' && depth === 0) {
      types.push(extractType(current.trim()));
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    types.push(extractType(current.trim()));
  }

  return types;
}

/**
 * Extract type from "type name" or just "type"
 */
function extractType(param: string): string {
  // Handle tuples
  if (param.startsWith('(')) {
    const tupleEnd = findMatchingParen(param);
    const tupleContent = param.slice(1, tupleEnd);
    const suffix = param.slice(tupleEnd + 1).trim();

    const innerTypes = parseParamTypes(tupleContent);
    return `(${innerTypes.join(',')})${suffix}`;
  }

  // Regular param: "uint256 amount" -> "uint256"
  const parts = param.split(/\s+/);
  return parts[0];
}

function findMatchingParen(str: string): number {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return str.length;
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
      throw new Error(
        'useExternalRegistry was removed. Look up descriptors with createOfficialRegistry(), or pass indexes and cache for offline use.'
      );
    }
  }

  /**
   * Find descriptor for a function signature or selector
   */
  find(signature: string): RegistryMatch | null {
    const normalized = normalizeSignature(signature);

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
        const normalized = normalizeSignature(signature);
        this.customIndex.set(normalized, { descriptor, format });

        // Register signature with the decoder so it can decode the calldata
        // This is necessary for custom descriptors to work
        if (!signature.startsWith('0x')) {
          registerSignature(signature);
          // Also index by selector for lookup
          const selector = computeSelector(signature);
          this.customIndex.set(selector, { descriptor, format });
        }
      }
    }

    return results;
  }

  /**
   * Get all registered descriptors
   */
  getAll(): InputDescriptor[] {
    return [...this.customDescriptors, ...BUILTIN_DESCRIPTORS];
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      custom: this.customDescriptors.length,
      builtin: BUILTIN_DESCRIPTORS.length,
    };
  }
}

export { ERC20_DESCRIPTOR, ERC721_DESCRIPTOR, WETH_DESCRIPTOR };
