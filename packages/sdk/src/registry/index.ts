/**
 * ERC-7730 Registry
 *
 * Manages both built-in descriptors and the external community registry.
 */

import type { ERC7730Descriptor, FunctionFormat } from '../types/erc7730.js';
import { ERC20_DESCRIPTOR } from './erc20.js';
import { ERC721_DESCRIPTOR } from './erc721.js';
import { WETH_DESCRIPTOR } from './weth.js';
import {
  findBySelector as findExternalBySelector,
  findByAddress as findExternalByAddress,
  getExternalDescriptors,
  getStats,
} from './external.js';
import { validateDescriptor, type ValidationResult } from '../generate/validate.js';
import { registerSignature, computeSelector } from '../core/signatures.js';

// Built-in descriptors for common standards
// These are always available and serve as fallbacks
// Order matters! For signature collisions, first match wins.
export const BUILTIN_DESCRIPTORS: ERC7730Descriptor[] = [
  WETH_DESCRIPTOR, // Specific contract, should be checked first
  ERC20_DESCRIPTOR, // Most common standard
  ERC721_DESCRIPTOR, // NFT standard (has signature collisions with ERC20)
];

// Index by function signature for fast lookup
type SignatureIndex = Map<
  string,
  { descriptor: ERC7730Descriptor; format: FunctionFormat }
>;

let signatureIndex: SignatureIndex | null = null;

function buildSignatureIndex(): SignatureIndex {
  const index: SignatureIndex = new Map();

  for (const descriptor of BUILTIN_DESCRIPTORS) {
    for (const [signature, format] of Object.entries(descriptor.display.formats)) {
      const normalized = normalizeSignature(signature);
      // First match wins - don't overwrite if already exists
      if (!index.has(normalized)) {
        index.set(normalized, { descriptor, format });
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
  descriptor: ERC7730Descriptor;
  format: FunctionFormat;
}

/**
 * Registry class for managing ERC-7730 descriptors
 */
export class Registry {
  private customDescriptors: ERC7730Descriptor[] = [];
  private customIndex: SignatureIndex = new Map();
  private useExternalRegistry: boolean;

  constructor(options: { useExternalRegistry?: boolean } = {}) {
    this.useExternalRegistry = options.useExternalRegistry ?? true;
  }

  /**
   * Find descriptor for a function signature or selector
   */
  find(signature: string): RegistryMatch | null {
    const normalized = normalizeSignature(signature);

    // 1. Check custom first (allows user overrides)
    const custom = this.customIndex.get(normalized);
    if (custom) {
      return custom;
    }

    // 2. Check external registry (community descriptors)
    if (this.useExternalRegistry) {
      // For selectors, search directly
      if (normalized.startsWith('0x')) {
        const externalMatches = findExternalBySelector(normalized);
        if (externalMatches.length > 0) {
          return externalMatches[0];
        }
      }
    }

    // 3. Check built-in (ERC20, ERC721, etc.)
    if (!signatureIndex) {
      signatureIndex = buildSignatureIndex();
    }

    return signatureIndex.get(normalized) || null;
  }

  /**
   * Find descriptor by contract address and chain
   */
  findByAddress(address: string, chainId: number): ERC7730Descriptor | null {
    const normalizedAddress = address.toLowerCase();

    // 1. Check custom first
    for (const descriptor of this.customDescriptors) {
      const deployments = descriptor.context.contract?.deployments || [];
      for (const deployment of deployments) {
        if (
          deployment.chainId === chainId &&
          deployment.address.toLowerCase() === normalizedAddress
        ) {
          return descriptor;
        }
      }
    }

    // 2. Check external registry
    if (this.useExternalRegistry) {
      const externalDescriptors = findExternalByAddress(address, chainId);
      if (externalDescriptors.length > 0) {
        return externalDescriptors[0];
      }
    }

    // 3. Check built-in
    for (const descriptor of BUILTIN_DESCRIPTORS) {
      const deployments = descriptor.context.contract?.deployments || [];
      for (const deployment of deployments) {
        if (
          deployment.chainId === chainId &&
          deployment.address.toLowerCase() === normalizedAddress
        ) {
          return descriptor;
        }
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
  extend(descriptors: ERC7730Descriptor | ERC7730Descriptor[]): ValidationResult[] {
    const toAdd = Array.isArray(descriptors) ? descriptors : [descriptors];
    const results: ValidationResult[] = [];

    for (let i = 0; i < toAdd.length; i++) {
      const descriptor = toAdd[i];

      // Validate descriptor
      const validation = validateDescriptor(descriptor);
      results.push(validation);

      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
        console.error(
          `[ERC7730 SDK] Invalid descriptor at index ${i}, skipping:\n${errorMessages}`
        );
        continue;
      }

      // Add valid descriptor
      this.customDescriptors.push(descriptor);

      // Index by signature and register with decoder
      for (const [signature, format] of Object.entries(
        descriptor.display.formats
      )) {
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
  getAll(): ERC7730Descriptor[] {
    const external = this.useExternalRegistry ? getExternalDescriptors() : [];
    return [...this.customDescriptors, ...external, ...BUILTIN_DESCRIPTORS];
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const externalStats = this.useExternalRegistry
      ? getStats()
      : { protocols: 0, descriptors: 0, selectors: 0, addresses: 0 };

    return {
      custom: this.customDescriptors.length,
      builtin: BUILTIN_DESCRIPTORS.length,
      external: externalStats,
    };
  }
}

export { ERC20_DESCRIPTOR, ERC721_DESCRIPTOR, WETH_DESCRIPTOR };
