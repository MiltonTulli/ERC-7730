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

const SCHEMA_VERSION_RE = /erc7730-v([12])(?=[.\-_]|\/|$|\.schema)/i;

const validateV2 = lazyValidator(v2Schema);
const validateV1 = lazyValidator(v1Schema);

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

function issueFromAjv(error: ErrorObject): ValidationIssue {
  return {
    path: errorPath(error),
    message: error.message ?? 'Validation failed',
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
  input: Record<string, unknown>
): ValidationIssue[] {
  const ok = validate(input);
  if (ok) {
    return [];
  }
  return (validate.errors ?? []).map(issueFromAjv);
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
        declared === '2' ? schemaErrors(validateV2(), input) : schemaErrors(validateV1(), input);
      if (errors.length > 0) {
        return fail(errors);
      }
      return succeed(input, declared);
    }

    const v2Errors = schemaErrors(validateV2(), input);
    if (v2Errors.length === 0) {
      return succeed(input, '2');
    }

    const v1Errors = schemaErrors(validateV1(), input);
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
