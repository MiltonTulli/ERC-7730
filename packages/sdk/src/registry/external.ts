/**
 * External registry loader
 *
 * Loads and adapts the embedded registry for use with the SDK's internal types.
 * The registry is embedded at build time from the @erc7730/registry package.
 */

import type {
  ERC7730Descriptor,
  FieldDefinition,
  FieldFormat,
  FormatParams,
  FunctionFormat,
} from '../types/erc7730';
import { EMBEDDED_REGISTRY } from './embedded';
import type { EmbeddedDescriptor, EmbeddedField, EmbeddedFunctionFormat } from './embeddedTypes';

const registry = EMBEDDED_REGISTRY;

const FIELD_FORMATS: ReadonlySet<string> = new Set<FieldFormat>([
  'raw',
  'addressName',
  'tokenAmount',
  'nftName',
  'date',
  'enum',
  'calldata',
  'duration',
  'unit',
]);

function isFieldFormat(format: string): format is FieldFormat {
  return FIELD_FORMATS.has(format);
}

/**
 * Format params in the embed are an open object. `FieldDefinition` names the
 * params the SDK formatters read; keep the object and narrow to that union.
 */
function readParams(params: EmbeddedField['params']): FormatParams | undefined {
  if (!params) {
    return undefined;
  }
  return params as FormatParams;
}

function readChainId(chainId: number | string): number | undefined {
  if (typeof chainId === 'number' && Number.isFinite(chainId)) {
    return chainId;
  }
  if (typeof chainId === 'string' && /^\d+$/.test(chainId)) {
    return Number(chainId);
  }
  return undefined;
}

function textOrUndefined(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function convertField(field: EmbeddedField): FieldDefinition | null {
  // Skip fields that use $ref without label/format (definition references)
  if (field.$ref && !field.label) {
    return null;
  }

  return {
    path: typeof field.path === 'string' ? field.path : '',
    label: textOrUndefined(field.label) ?? textOrUndefined(field.$id) ?? 'Unknown',
    format: field.format && isFieldFormat(field.format) ? field.format : undefined,
    params: readParams(field.params),
  };
}

function readIntent(format: EmbeddedFunctionFormat): string | undefined {
  return textOrUndefined(format.intent) ?? textOrUndefined(format.$id);
}

function convertToDescriptor(entry: EmbeddedDescriptor): ERC7730Descriptor {
  const formats: Record<string, FunctionFormat> = {};

  for (const [selector, format] of Object.entries(entry.display?.formats ?? {})) {
    const fields = (format.fields ?? [])
      .map((field) => convertField(field))
      .filter((field): field is FieldDefinition => field !== null);

    formats[selector] = {
      intent: readIntent(format),
      fields,
      required: format.required,
      excluded: format.excluded ?? undefined,
    };
  }

  const deployments: { chainId: number; address: string }[] = [];
  for (const deployment of entry.context?.contract?.deployments ?? []) {
    const chainId = readChainId(deployment.chainId);
    if (chainId === undefined) {
      continue;
    }
    deployments.push({
      chainId,
      address: deployment.address,
    });
  }

  return {
    context: {
      contract: deployments.length > 0 ? { deployments } : undefined,
    },
    metadata: entry.metadata
      ? {
          owner: entry.metadata.owner,
          info: entry.metadata.info,
        }
      : undefined,
    display: {
      formats,
    },
  };
}

/**
 * Get all descriptors from the external registry
 */
export function getExternalDescriptors(): ERC7730Descriptor[] {
  return Object.values(registry.descriptors).map(convertToDescriptor);
}

/**
 * Find descriptors by function selector
 */
export function findBySelector(
  selector: string
): { descriptor: ERC7730Descriptor; format: FunctionFormat }[] {
  const normalizedSelector = selector.toLowerCase();
  const ids = registry.bySelector[normalizedSelector] ?? [];

  const results: { descriptor: ERC7730Descriptor; format: FunctionFormat }[] = [];

  for (const id of ids) {
    const entry = registry.descriptors[id];
    if (!entry) {
      continue;
    }

    const descriptor = convertToDescriptor(entry);

    for (const [sig, format] of Object.entries(descriptor.display.formats)) {
      if (sig.toLowerCase() === normalizedSelector) {
        results.push({ descriptor, format });
        break;
      }
    }
  }

  return results;
}

/**
 * Find descriptors by contract address
 */
export function findByAddress(address: string, chainId: number): ERC7730Descriptor[] {
  const key = `${chainId}:${address.toLowerCase()}`;
  const ids = registry.byAddress[key] ?? [];
  const descriptors: ERC7730Descriptor[] = [];

  for (const id of ids) {
    const entry = registry.descriptors[id];
    if (entry) {
      descriptors.push(convertToDescriptor(entry));
    }
  }

  return descriptors;
}

/**
 * Get registry statistics
 */
export function getStats() {
  return registry.stats;
}

export { registry as EXTERNAL_REGISTRY };
