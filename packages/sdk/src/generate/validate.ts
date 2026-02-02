/**
 * ERC-7730 Descriptor Validation
 */

import type { FieldFormat } from '../types/erc7730.js';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const VALID_FORMATS: FieldFormat[] = [
  'raw',
  'addressName',
  'tokenAmount',
  'nftName',
  'date',
  'enum',
  'calldata',
  'duration',
  'unit',
];

/**
 * Validate an ERC-7730 descriptor
 */
export function validateDescriptor(descriptor: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // Check if it's an object
  if (!descriptor || typeof descriptor !== 'object') {
    return {
      valid: false,
      errors: [{ path: '', message: 'Descriptor must be an object' }],
    };
  }

  const desc = descriptor as Record<string, unknown>;

  // Validate context
  if (!desc.context) {
    errors.push({ path: 'context', message: 'Context is required' });
  } else {
    validateContext(desc.context, errors);
  }

  // Validate display
  if (!desc.display) {
    errors.push({ path: 'display', message: 'Display is required' });
  } else {
    validateDisplay(desc.display, errors);
  }

  // Validate metadata (optional)
  if (desc.metadata) {
    validateMetadata(desc.metadata, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateContext(context: unknown, errors: ValidationError[]): void {
  if (typeof context !== 'object' || context === null) {
    errors.push({ path: 'context', message: 'Context must be an object' });
    return;
  }

  const ctx = context as Record<string, unknown>;

  // Must have either contract or eip712
  if (!ctx.contract && !ctx.eip712) {
    errors.push({
      path: 'context',
      message: 'Context must have either "contract" or "eip712"',
    });
    return;
  }

  // Validate contract context
  if (ctx.contract) {
    validateContractContext(ctx.contract, errors);
  }
}

function validateContractContext(contract: unknown, errors: ValidationError[]): void {
  if (typeof contract !== 'object' || contract === null) {
    errors.push({ path: 'context.contract', message: 'Contract must be an object' });
    return;
  }

  const c = contract as Record<string, unknown>;

  // Validate deployments
  if (!c.deployments || !Array.isArray(c.deployments)) {
    errors.push({
      path: 'context.contract.deployments',
      message: 'Deployments must be an array',
    });
    return;
  }

  if (c.deployments.length === 0) {
    errors.push({
      path: 'context.contract.deployments',
      message: 'Deployments must have at least one entry',
    });
    return;
  }

  // Validate each deployment
  for (let i = 0; i < c.deployments.length; i++) {
    const dep = c.deployments[i] as Record<string, unknown>;
    if (typeof dep.chainId !== 'number') {
      errors.push({
        path: `context.contract.deployments[${i}].chainId`,
        message: 'Chain ID must be a number',
      });
    }
    if (typeof dep.address !== 'string' || !isValidAddress(dep.address)) {
      errors.push({
        path: `context.contract.deployments[${i}].address`,
        message: 'Address must be a valid Ethereum address',
      });
    }
  }
}

function validateDisplay(display: unknown, errors: ValidationError[]): void {
  if (typeof display !== 'object' || display === null) {
    errors.push({ path: 'display', message: 'Display must be an object' });
    return;
  }

  const d = display as Record<string, unknown>;

  // Validate formats
  if (!d.formats || typeof d.formats !== 'object') {
    errors.push({ path: 'display.formats', message: 'Formats must be an object' });
    return;
  }

  const formats = d.formats as Record<string, unknown>;

  // Validate each format entry
  for (const [signature, format] of Object.entries(formats)) {
    validateFunctionFormat(signature, format, errors);
  }
}

function validateFunctionFormat(signature: string, format: unknown, errors: ValidationError[]): void {
  const path = `display.formats["${signature}"]`;

  if (typeof format !== 'object' || format === null) {
    errors.push({ path, message: 'Format must be an object' });
    return;
  }

  const f = format as Record<string, unknown>;

  // Validate intent (optional)
  if (f.intent !== undefined && typeof f.intent !== 'string') {
    errors.push({ path: `${path}.intent`, message: 'Intent must be a string' });
  }

  // Validate fields
  if (!f.fields || !Array.isArray(f.fields)) {
    errors.push({ path: `${path}.fields`, message: 'Fields must be an array' });
    return;
  }

  // Validate each field
  for (let i = 0; i < f.fields.length; i++) {
    validateFieldDefinition(f.fields[i], `${path}.fields[${i}]`, errors);
  }
}

function validateFieldDefinition(field: unknown, path: string, errors: ValidationError[]): void {
  if (typeof field !== 'object' || field === null) {
    errors.push({ path, message: 'Field must be an object' });
    return;
  }

  const f = field as Record<string, unknown>;

  // Validate path
  if (typeof f.path !== 'string' || f.path.length === 0) {
    errors.push({ path: `${path}.path`, message: 'Path must be a non-empty string' });
  }

  // Validate label
  if (typeof f.label !== 'string' || f.label.length === 0) {
    errors.push({ path: `${path}.label`, message: 'Label must be a non-empty string' });
  }

  // Validate format (optional)
  if (f.format !== undefined) {
    if (typeof f.format !== 'string' || !VALID_FORMATS.includes(f.format as FieldFormat)) {
      errors.push({
        path: `${path}.format`,
        message: `Format must be one of: ${VALID_FORMATS.join(', ')}`,
      });
    }
  }
}

function validateMetadata(metadata: unknown, errors: ValidationError[]): void {
  if (typeof metadata !== 'object' || metadata === null) {
    errors.push({ path: 'metadata', message: 'Metadata must be an object' });
    return;
  }

  const m = metadata as Record<string, unknown>;

  // Validate owner (optional)
  if (m.owner !== undefined && typeof m.owner !== 'string') {
    errors.push({ path: 'metadata.owner', message: 'Owner must be a string' });
  }

  // Validate info (optional)
  if (m.info !== undefined) {
    if (typeof m.info !== 'object' || m.info === null) {
      errors.push({ path: 'metadata.info', message: 'Info must be an object' });
    }
  }
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
