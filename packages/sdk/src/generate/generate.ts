/**
 * Generate a draft ERC-7730 v2 descriptor from an ABI.
 *
 * Output is a starting point for authors — never a high-confidence runtime source.
 */

import type { InputDescriptor } from '../types/descriptor.js';
import type {
  DisplayField,
  DisplayFormat,
  ERC7730V2Descriptor,
  ERC7730V2Display,
  ERC7730V2Metadata,
  EnumDefinition,
} from '../types/v2.js';
import { inferFormat, inferLabel } from './inferFormat.js';
import { inferIntent } from './inferIntent.js';

export const V2_SCHEMA_URI = 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json';

export const GENERATED_DESCRIPTOR_COMMENT =
  'TODO: generated draft — review intents and formats before submitting to the official registry. Never a high-confidence runtime source.';

export interface ABIParameter {
  name: string;
  type: string;
  internalType?: string;
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
  chainId: number;
  address: string;
  abi: ABI;
  owner?: string;
  url?: string;
  contractName?: string;
  /** Only generate for these function names (optional filter). */
  functions?: string[];
  /** Skip view/pure functions. Default true. */
  skipReadOnly?: boolean;
}

/** ROADMAP name for {@link GenerateOptions}. */
export type GenerateInput = GenerateOptions;

export type GeneratedDescriptor = ERC7730V2Descriptor & {
  $schema: string;
  $comment: string;
  context: {
    $id?: string;
    contract: {
      deployments: Array<{ chainId: number; address: string }>;
    };
  };
  display: ERC7730V2Display;
};

type NamedFunction = ABIFunction & { name: string; type: 'function' };

function isNamedFunction(item: ABIFunction): item is NamedFunction {
  return item.type === 'function' && typeof item.name === 'string';
}

/**
 * Compute function signature (e.g., "transfer(address,uint256)").
 */
function computeSignature(func: NamedFunction): string {
  const inputs = func.inputs || [];
  const types = inputs.map((input) => formatABIType(input));
  return `${func.name}(${types.join(',')})`;
}

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
 * ERC-20-shaped ABI: both `transfer` and `approve` with the standard types.
 * Token amounts then use `tokenPath: "@.to"` (the token contract).
 */
export function looksLikeErc20(abi: ABI): boolean {
  const signatures = new Set(abi.filter(isNamedFunction).map(computeSignature));
  return signatures.has('transfer(address,uint256)') && signatures.has('approve(address,uint256)');
}

function generateFieldDefinitions(
  param: ABIParameter,
  path: string,
  looksLikeToken: boolean,
  enums: Record<string, EnumDefinition>
): DisplayField[] {
  if (param.type === 'tuple' && param.components) {
    const fields: DisplayField[] = [];
    for (let i = 0; i < param.components.length; i++) {
      const component = param.components[i];
      const childPath = component.name ? `${path}.${component.name}` : `${path}.[${i}]`;
      fields.push(...generateFieldDefinitions(component, childPath, looksLikeToken, enums));
    }
    return fields;
  }

  if (param.type === 'tuple[]' && param.components) {
    return [
      {
        path,
        label: inferLabel(param.name || 'items'),
        format: 'raw',
      },
    ];
  }

  if (param.type.endsWith('[]')) {
    return [
      {
        path,
        label: inferLabel(param.name || 'items'),
        format: 'raw',
      },
    ];
  }

  const inferred = inferFormat(param.name || '', param.type, {
    looksLikeErc20: looksLikeToken,
    internalType: param.internalType,
  });

  if (inferred.enumName && !enums[inferred.enumName]) {
    enums[inferred.enumName] = {};
  }

  const field: DisplayField = {
    path,
    label: inferLabel(param.name || path.replace(/^#\./, '')),
    format: inferred.format,
  };

  if (inferred.params) {
    field.params = inferred.params;
  }

  return [field];
}

function generateFunctionFormat(
  func: NamedFunction,
  looksLikeToken: boolean,
  enums: Record<string, EnumDefinition>
): DisplayFormat {
  const inputs = func.inputs || [];
  const fields: DisplayField[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const path = input.name ? `#.${input.name}` : `#.[${i}]`;
    fields.push(...generateFieldDefinitions(input, path, looksLikeToken, enums));
  }

  return {
    intent: inferIntent(func.name),
    fields,
  };
}

function selectFunctions(options: GenerateOptions): NamedFunction[] {
  const { abi, functions, skipReadOnly = true } = options;
  const named = abi.filter(isNamedFunction);
  const filtered = functions ? named.filter((func) => functions.includes(func.name)) : named;
  if (!skipReadOnly) {
    return filtered;
  }
  return filtered.filter(
    (func) => func.stateMutability !== 'view' && func.stateMutability !== 'pure'
  );
}

function buildMetadata(
  options: GenerateOptions,
  enums: Record<string, EnumDefinition>
): ERC7730V2Metadata | undefined {
  const metadata: ERC7730V2Metadata = {};
  if (options.owner) {
    metadata.owner = options.owner;
  }
  if (options.contractName) {
    metadata.contractName = options.contractName;
  }
  if (options.url) {
    metadata.info = { url: options.url };
  }
  if (Object.keys(enums).length > 0) {
    metadata.enums = enums;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Generate a draft ERC-7730 v2 descriptor from an ABI.
 *
 * Heuristics pick formats (`tokenAmount`, `date`, `addressName`, `enum`).
 * Authors must edit intents before submitting to the official registry.
 * Runtime use of this output is never `confidence: "high"`.
 */
export function generateDescriptor(options: GenerateOptions): GeneratedDescriptor {
  const writeFunctions = selectFunctions(options);
  const looksLikeToken = looksLikeErc20(options.abi);
  const enums: Record<string, EnumDefinition> = {};
  const formats: Record<string, DisplayFormat> = {};

  for (const func of writeFunctions) {
    formats[computeSignature(func)] = generateFunctionFormat(func, looksLikeToken, enums);
  }

  const context: GeneratedDescriptor['context'] = {
    contract: {
      deployments: [
        {
          chainId: options.chainId,
          address: options.address.toLowerCase(),
        },
      ],
    },
  };
  const id = options.contractName ?? options.owner;
  if (id) {
    context.$id = id;
  }

  const descriptor: GeneratedDescriptor = {
    $schema: V2_SCHEMA_URI,
    $comment: GENERATED_DESCRIPTOR_COMMENT,
    context,
    display: { formats },
  };

  const metadata = buildMetadata(options, enums);
  if (metadata) {
    descriptor.metadata = metadata;
  }

  return descriptor;
}

/**
 * Generate a v2 draft covering a single ABI function.
 */
export function generateFunctionDescriptor(
  func: NamedFunction,
  chainId: number,
  address: string
): GeneratedDescriptor {
  return generateDescriptor({
    chainId,
    address,
    abi: [func],
    skipReadOnly: false,
  });
}

/** Generated JSON is an unresolved InputDescriptor. */
export function asInputDescriptor(descriptor: GeneratedDescriptor): InputDescriptor {
  return descriptor;
}
