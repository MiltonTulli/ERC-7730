/**
 * Validate registry `testsv2` files against the official tests schema.
 */

import type { ErrorObject, Options, ValidateFunction } from 'ajv';
import * as addFormatsModule from 'ajv-formats';
import * as Ajv2020Module from 'ajv/dist/2020.js';
import type { ValidationIssue } from '../types/descriptor.js';
import testsSchema from './official/erc7730-tests-v2.schema.json' with { type: 'json' };

type Ajv2020Ctor = new (opts?: Options) => import('ajv').default;
type AddFormatsFn = typeof import('ajv-formats').default;

function cjsDefault<T>(mod: T): T extends { default: infer D } ? D : T {
  if (typeof mod === 'object' && mod !== null && 'default' in mod) {
    return (mod as { default: T extends { default: infer D } ? D : T }).default;
  }
  return mod as T extends { default: infer D } ? D : T;
}

const Ajv2020 = cjsDefault(Ajv2020Module) as unknown as Ajv2020Ctor;
const addFormats = cjsDefault(addFormatsModule) as unknown as AddFormatsFn;

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: true,
});
addFormats(ajv);

function compile(schema: object): ValidateFunction {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key !== '$schema') {
      copy[key] = value;
    }
  }
  return ajv.compile(copy);
}

const validate = compile(testsSchema);

function pointerFromError(error: ErrorObject): string {
  const base = error.instancePath || '';
  if (error.keyword === 'required' && error.params && typeof error.params === 'object') {
    const missing = (error.params as { missingProperty?: string }).missingProperty;
    if (missing) {
      return `${base}/${missing.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    }
  }
  return base || '/';
}

export interface TestsValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
}

/**
 * Validate a `registry/<entity>/testsv2/*.json` document.
 * Returns `{ ok, errors }` — never throws.
 */
export function validateDescriptorTests(input: unknown): TestsValidationResult {
  const ok = validate(input);
  if (ok) {
    return { ok: true, errors: [] };
  }
  const errors: ValidationIssue[] = (validate.errors ?? []).map((error) => ({
    path: pointerFromError(error),
    message: error.message ?? 'invalid',
    rule: error.keyword,
  }));
  return { ok: false, errors };
}
