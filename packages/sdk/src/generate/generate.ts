/**
 * Generate ERC-7730 descriptors from ABI
 */

import type {
  ERC7730Descriptor,
  FieldDefinition,
  FunctionFormat,
} from '../types/erc7730.js';
import { inferFormat, inferLabel } from './inferFormat.js';
import { inferIntent } from './inferIntent.js';

// ============================================================================
// Types
// ============================================================================

export interface ABIParameter {
  name: string;
  type: string;
  components?: ABIParameter[];
  indexed?: boolean;
}

export interface ABIFunction {
  type: 'function' | 'constructor' | 'event' | 'fallback' | 'receive';
  name?: string;
  inputs?: ABIParameter[];
  outputs?: ABIParameter[];
  stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
}

export type ABI = ABIFunction[];

export interface GenerateOptions {
  /** Chain ID for deployment */
  chainId: number;

  /** Contract address */
  address: string;

  /** Contract ABI (array of function definitions) */
  abi: ABI;

  /** Protocol/owner display name */
  owner?: string;

  /** Protocol URL */
  url?: string;

  /** Only generate for these function names (optional filter) */
  functions?: string[];

  /** Skip view/pure functions */
  skipReadOnly?: boolean;
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate an ERC-7730 descriptor from an ABI
 *
 * @example
 * ```typescript
 * const descriptor = generateDescriptor({
 *   chainId: 1,
 *   address: '0x...',
 *   abi: contractABI,
 *   owner: 'Uniswap',
 * });
 * ```
 */
export function generateDescriptor(options: GenerateOptions): ERC7730Descriptor {
  const { chainId, address, abi, owner, url, functions, skipReadOnly = true } = options;

  // Filter to only function types
  const abiFunctions = abi.filter(
    (item): item is ABIFunction & { name: string; type: 'function' } =>
      item.type === 'function' && typeof item.name === 'string'
  );

  // Filter by function names if specified
  const filteredFunctions = functions
    ? abiFunctions.filter((f) => functions.includes(f.name))
    : abiFunctions;

  // Skip read-only functions if specified
  const writeFunctions = skipReadOnly
    ? filteredFunctions.filter(
        (f) => f.stateMutability !== 'view' && f.stateMutability !== 'pure'
      )
    : filteredFunctions;

  // Generate formats for each function
  const formats: Record<string, FunctionFormat> = {};

  for (const func of writeFunctions) {
    const signature = computeSignature(func);
    formats[signature] = generateFunctionFormat(func);
  }

  // Build descriptor
  const descriptor: ERC7730Descriptor = {
    $schema: 'https://eips.ethereum.org/EIPS/eip-7730',
    context: {
      contract: {
        abi: abi as unknown as readonly unknown[],
        deployments: [
          {
            chainId,
            address: address.toLowerCase(),
          },
        ],
      },
    },
    display: {
      formats,
    },
  };

  // Add metadata if provided
  if (owner || url) {
    descriptor.metadata = {};
    if (owner) {
      descriptor.metadata.owner = owner;
    }
    if (url) {
      descriptor.metadata.info = { url };
    }
  }

  return descriptor;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute function signature (e.g., "transfer(address,uint256)")
 */
function computeSignature(func: ABIFunction & { name: string }): string {
  const inputs = func.inputs || [];
  const types = inputs.map((input) => formatABIType(input));
  return `${func.name}(${types.join(',')})`;
}

/**
 * Format ABI type for signature (handle tuples)
 */
function formatABIType(param: ABIParameter): string {
  if (param.type === 'tuple' && param.components) {
    const componentTypes = param.components.map(formatABIType);
    return `(${componentTypes.join(',')})`;
  }
  if (param.type === 'tuple[]' && param.components) {
    const componentTypes = param.components.map(formatABIType);
    return `(${componentTypes.join(',')})[]`;
  }
  return param.type;
}

/**
 * Generate FunctionFormat for an ABI function
 */
function generateFunctionFormat(func: ABIFunction & { name: string }): FunctionFormat {
  const inputs = func.inputs || [];
  const fields: FieldDefinition[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const fieldDefs = generateFieldDefinitions(input, `[${i}]`);
    fields.push(...fieldDefs);
  }

  return {
    intent: inferIntent(func.name),
    fields,
  };
}

/**
 * Generate field definitions for an ABI parameter (handles nested structs)
 */
function generateFieldDefinitions(param: ABIParameter, basePath: string): FieldDefinition[] {
  // Handle tuple (struct) types
  if (param.type === 'tuple' && param.components) {
    const fields: FieldDefinition[] = [];
    for (const component of param.components) {
      const componentPath = `${basePath}.${component.name}`;
      fields.push(...generateFieldDefinitions(component, componentPath));
    }
    return fields;
  }

  // Handle tuple array types
  if (param.type === 'tuple[]' && param.components) {
    // For arrays of structs, we just note it's an array
    // Individual items would need runtime handling
    return [
      {
        path: basePath,
        label: inferLabel(param.name || 'items'),
        format: 'raw',
      },
    ];
  }

  // Handle regular arrays
  if (param.type.endsWith('[]')) {
    return [
      {
        path: basePath,
        label: inferLabel(param.name || 'items'),
        format: 'raw',
      },
    ];
  }

  // Handle primitive types
  const { format, params } = inferFormat(param.name || '', param.type);
  const field: FieldDefinition = {
    path: basePath,
    label: inferLabel(param.name || `param${basePath}`),
    format,
  };

  if (params) {
    field.params = params;
  }

  return [field];
}

/**
 * Generate descriptor for a single function (useful for extending)
 */
export function generateFunctionDescriptor(
  func: ABIFunction & { name: string },
  chainId: number,
  address: string
): ERC7730Descriptor {
  const signature = computeSignature(func);

  return {
    context: {
      contract: {
        deployments: [{ chainId, address: address.toLowerCase() }],
      },
    },
    display: {
      formats: {
        [signature]: generateFunctionFormat(func),
      },
    },
  };
}
