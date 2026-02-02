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
  FunctionFormat,
} from '../types/erc7730.js';
import { EMBEDDED_REGISTRY } from './embedded.js';

// Use the embedded registry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = EMBEDDED_REGISTRY as any;

/**
 * Supported field formats in the SDK
 */
const SUPPORTED_FORMATS: Set<string> = new Set([
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

/**
 * Convert external field definition to SDK field definition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertField(field: any): FieldDefinition | null {
  // Skip fields that use $ref without label/format (definition references)
  if (field.$ref && !field.label) {
    return null;
  }

  const format = field.format as string;
  const normalizedFormat = SUPPORTED_FORMATS.has(format) ? (format as FieldFormat) : undefined;

  return {
    path: field.path || '',
    label: field.label || field.$id || 'Unknown',
    format: normalizedFormat,
    params: field.params,
  };
}

/**
 * Convert external registry format to SDK descriptor format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertToDescriptor(entry: any): ERC7730Descriptor {
  const formats: Record<string, FunctionFormat> = {};

  if (entry.display?.formats) {
    for (const [selector, format] of Object.entries(entry.display.formats)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extFormat = format as any;

      // Convert fields, filtering out null (unsupported field types)
      const fields: FieldDefinition[] = (extFormat.fields || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => convertField(f))
        .filter((f: FieldDefinition | null): f is FieldDefinition => f !== null);

      formats[selector] = {
        intent: extFormat.intent || extFormat.$id,
        fields,
        required: extFormat.required,
        excluded: extFormat.excluded,
      };
    }
  }

  // Build deployments array
  const deployments =
    entry.context?.contract?.deployments?.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => ({
        chainId: d.chainId,
        address: d.address,
      })
    ) || [];

  return {
    context: {
      $id: entry.context?.$id,
      contract: deployments.length > 0 ? { deployments } : undefined,
      // Skip eip712 context for now as the format may vary
    },
    metadata: entry.metadata
      ? {
          owner: entry.metadata.owner,
          info: entry.metadata.info,
          constants: entry.metadata.constants,
          enums: entry.metadata.enums,
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
  return Object.values(registry.descriptors || {}).map(convertToDescriptor);
}

/**
 * Find descriptors by function selector
 */
export function findBySelector(
  selector: string
): { descriptor: ERC7730Descriptor; format: FunctionFormat }[] {
  const normalizedSelector = selector.toLowerCase();
  const ids = registry.bySelector?.[normalizedSelector] || [];

  const results: { descriptor: ERC7730Descriptor; format: FunctionFormat }[] = [];

  for (const id of ids) {
    const entry = registry.descriptors?.[id];
    if (!entry) continue;

    const descriptor = convertToDescriptor(entry);

    // Find the matching format
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
  const ids = registry.byAddress?.[key] || [];

  return (
    ids
      .map((id: string) => registry.descriptors?.[id])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((entry: any) => !!entry)
      .map(convertToDescriptor)
  );
}

/**
 * Get registry statistics
 */
export function getStats() {
  return (
    registry.stats || {
      protocols: 0,
      descriptors: 0,
      selectors: 0,
      addresses: 0,
    }
  );
}

export { registry as EXTERNAL_REGISTRY };
