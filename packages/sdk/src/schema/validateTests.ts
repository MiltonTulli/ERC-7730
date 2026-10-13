/**
 * Validate registry `testsv2` files against the official tests schema.
 */

import type { ErrorObject } from 'ajv';
import type { ValidationIssue } from '../types/descriptor';
import { lazyValidator } from './ajv';
import testsSchema from './official/erc7730-tests-v2.schema.json' with { type: 'json' };

const testsValidator = lazyValidator(testsSchema);

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
  const validate = testsValidator();
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
