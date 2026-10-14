/**
 * JSON Schema validation for ERC-7730 descriptors.
 *
 * v2 is the default. Valid v1 documents are accepted on read and tagged
 * `version: "1"`. Invalid input returns `{ ok: false, errors }` — never throws.
 */

import type { ErrorObject, ValidateFunction } from 'ajv';
import type {
  DescriptorVersion,
  InputDescriptor,
  ValidationIssue,
  ValidationResult,
} from '../types/descriptor';
import { isPlainObject } from '../util';
import { lazyValidator } from './ajv';
import v1Schema from './official/erc7730-v1.schema.json' with { type: 'json' };
import v2Schema from './official/erc7730-v2.schema.json' with { type: 'json' };
import { refineSchemaErrors } from './readableErrors';

const SCHEMA_VERSION_RE = /erc7730-v([12])(?=[.\-_]|\/|$|\.schema)/i;

const V2_SCHEMA_ID = 'erc7730-v2';
const V1_SCHEMA_ID = 'erc7730-v1';

const validateV2 = lazyValidator(v2Schema, V2_SCHEMA_ID);
const validateV1 = lazyValidator(v1Schema, V1_SCHEMA_ID);

function pointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function joinPointer(base: string, token: string): string {
  const prefix = base === '' ? '' : base;
  return `${prefix}/${pointerToken(token)}`;
}

function errorPath(error: ErrorObject): string {
  const base = error.instancePath ?? '';
  const params = error.params as Record<string, unknown> | undefined;

  if (error.keyword === 'required' && typeof params?.missingProperty === 'string') {
    return joinPointer(base, params.missingProperty);
  }
  if (error.keyword === 'additionalProperties' && typeof params?.additionalProperty === 'string') {
    return joinPointer(base, params.additionalProperty);
  }
  if (error.keyword === 'propertyNames' && typeof params?.propertyName === 'string') {
    return joinPointer(base, params.propertyName);
  }
  return base === '' ? '/' : base;
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  return undefined;
}

function oneOfList(allowed: readonly unknown[], data: unknown): string {
  const list = allowed.map((value) => JSON.stringify(value)).join(', ');
  const shown = scalarText(data);
  return shown === undefined ? `must be one of: ${list}` : `${shown} must be one of: ${list}`;
}

function issueMessage(error: ErrorObject & { data?: unknown }): string {
  const params = error.params as {
    allowedValue?: unknown;
    allowedValues?: unknown[];
    additionalProperty?: unknown;
  };
  if (error.keyword === 'enum' && Array.isArray(params.allowedValues)) {
    return oneOfList(params.allowedValues, error.data);
  }
  if (error.keyword === 'const' && 'allowedValue' in params) {
    const expected = JSON.stringify(params.allowedValue);
    const shown = scalarText(error.data);
    return shown === undefined ? `must be ${expected}` : `${shown} must be ${expected}`;
  }
  if (error.keyword === 'additionalProperties' && typeof params.additionalProperty === 'string') {
    return `must NOT have additional property '${params.additionalProperty}'`;
  }
  if (error.keyword === 'not') {
    const together = mutuallyExclusive(error.schema);
    if (together !== undefined) {
      return `must not set ${together} together`;
    }
  }
  return error.message ?? 'Validation failed';
}

function mutuallyExclusive(schema: unknown): string | undefined {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    return undefined;
  }
  const required = (schema as { required?: unknown }).required;
  if (
    !Array.isArray(required) ||
    required.length < 2 ||
    !required.every((item) => typeof item === 'string')
  ) {
    return undefined;
  }
  return required.join(' and ');
}

function issueFromAjv(error: ErrorObject): ValidationIssue {
  return {
    path: errorPath(error),
    message: issueMessage(error),
    rule: error.keyword,
  };
}

function fail(errors: ValidationIssue[]): ValidationResult {
  return { ok: false, errors };
}

function detectVersionFromSchema(schema: string): DescriptorVersion | undefined {
  const match = schema.match(SCHEMA_VERSION_RE);
  if (match?.[1] === '1' || match?.[1] === '2') {
    return match[1];
  }
  return undefined;
}

function schemaErrors(
  validate: ValidateFunction,
  input: Record<string, unknown>,
  schemaId: string
): ValidationIssue[] {
  const ok = validate(input);
  if (ok) {
    return [];
  }
  return refineSchemaErrors(validate.errors ?? [], schemaId).map(issueFromAjv);
}

function asInputDescriptor(input: Record<string, unknown>): InputDescriptor {
  return input as InputDescriptor;
}

function hasContextOrIncludes(input: Record<string, unknown>): boolean {
  if (input.context !== undefined) {
    return true;
  }
  return typeof input.includes === 'string' && input.includes.length > 0;
}

function missingContextError(): ValidationIssue {
  return {
    path: '/context',
    message: "must have required property 'context' (or 'includes')",
    rule: 'required',
  };
}

function succeed(input: Record<string, unknown>, version: DescriptorVersion): ValidationResult {
  if (!hasContextOrIncludes(input)) {
    return fail([missingContextError()]);
  }
  return { ok: true, descriptor: asInputDescriptor(input), version };
}

/**
 * Validate an ERC-7730 descriptor against the official JSON Schema.
 *
 * Version is taken from `$schema` when present. If `$schema` is omitted, v2 is
 * tried first and a valid v1 document is accepted as `version: "1"`.
 */
export function validateDescriptor(input: unknown): ValidationResult {
  try {
    if (!isPlainObject(input)) {
      return fail([
        {
          path: '/',
          message: 'Descriptor must be a JSON object',
          rule: 'type',
        },
      ]);
    }

    if ('$schema' in input && input.$schema !== undefined) {
      if (typeof input.$schema !== 'string') {
        return fail([
          {
            path: '/$schema',
            message: '$schema must be a string URI referencing erc7730-v1 or erc7730-v2',
            rule: 'type',
          },
        ]);
      }

      const declared = detectVersionFromSchema(input.$schema);
      if (!declared) {
        return fail([
          {
            path: '/$schema',
            message: 'Unsupported $schema. Expected a URI containing erc7730-v1 or erc7730-v2',
            rule: 'schema',
          },
        ]);
      }

      const errors =
        declared === '2'
          ? schemaErrors(validateV2(), input, V2_SCHEMA_ID)
          : schemaErrors(validateV1(), input, V1_SCHEMA_ID);
      if (errors.length > 0) {
        return fail(errors);
      }
      return succeed(input, declared);
    }

    const v2Errors = schemaErrors(validateV2(), input, V2_SCHEMA_ID);
    if (v2Errors.length === 0) {
      return succeed(input, '2');
    }

    const v1Errors = schemaErrors(validateV1(), input, V1_SCHEMA_ID);
    if (v1Errors.length === 0) {
      return succeed(input, '1');
    }

    if (!hasContextOrIncludes(input)) {
      const schemaIssues = v2Errors.length > 0 ? v2Errors : v1Errors;
      if (!schemaIssues.some((issue) => issue.path === '/context')) {
        schemaIssues.unshift(missingContextError());
      }
      return fail(schemaIssues);
    }

    return fail(v2Errors.length > 0 ? v2Errors : v1Errors);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown validation error';
    return fail([{ path: '/', message, rule: 'internal' }]);
  }
}

export type { DescriptorVersion, InputDescriptor, ValidationIssue, ValidationResult };
