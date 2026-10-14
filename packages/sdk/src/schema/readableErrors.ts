/**
 * Turn Ajv's allErrors dump into one issue per failed value.
 *
 * Format names are an anyOf of consts, so the matching field branch looks
 * worse until those consts are one message. A sibling arm that only lacks
 * its own key also has fewer errors than the arm that matched; those misses
 * sort after a branch that failed inside. Ajv repeats a failed `then` as an
 * `if` error and as `unevaluatedProperties`; those companions are dropped
 * once a more specific error names the same value.
 */

import type { ErrorObject, ValidateFunction } from 'ajv';
import { compileSharedSchema } from './ajv';

type AjvError = ErrorObject & { data?: unknown };

const MAX_COMBINATORS = 32;

const branchValidators = new WeakMap<object, ValidateFunction>();

function combinatorBranches(error: AjvError): unknown[] | undefined {
  if ((error.keyword === 'oneOf' || error.keyword === 'anyOf') && Array.isArray(error.schema)) {
    return error.schema as unknown[];
  }
  return undefined;
}

function combinatorKey(error: AjvError): string {
  return `${error.keyword}\u0000${error.schemaPath}\u0000${error.instancePath}`;
}

function deepestCombinator(
  errors: readonly AjvError[],
  skipped: ReadonlySet<string>
): AjvError | undefined {
  let best: AjvError | undefined;
  for (const error of errors) {
    if (combinatorBranches(error) === undefined || skipped.has(combinatorKey(error))) {
      continue;
    }
    if (
      best === undefined ||
      error.instancePath.length > best.instancePath.length ||
      (error.instancePath.length === best.instancePath.length &&
        error.schemaPath.length > best.schemaPath.length)
    ) {
      best = error;
    }
  }
  return best;
}

function joinInstancePath(parent: string, child: string): string {
  if (child === '') {
    return parent;
  }
  if (parent === '') {
    return child;
  }
  return child.startsWith('/') ? `${parent}${child}` : `${parent}/${child}`;
}

function rebase(parent: string, error: AjvError): AjvError {
  return { ...error, instancePath: joinInstancePath(parent, error.instancePath ?? '') };
}

function belongsTo(error: AjvError, parent: AjvError): boolean {
  if (error === parent) {
    return true;
  }
  const base = parent.instancePath ?? '';
  const path = error.instancePath ?? '';
  if (base === '') {
    return true;
  }
  return path === base || path.startsWith(`${base}/`);
}

function rewriteRefs(value: unknown, schemaId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteRefs(item, schemaId));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === '$ref' && typeof child === 'string' && child.startsWith('#/')) {
      out.$ref = `${schemaId}${child}`;
    } else {
      out[key] = rewriteRefs(child, schemaId);
    }
  }
  return out;
}

function branchValidator(schemaId: string, branch: object): ValidateFunction {
  const cached = branchValidators.get(branch);
  if (cached) {
    return cached;
  }
  const validate = compileSharedSchema(rewriteRefs(branch, schemaId) as object);
  branchValidators.set(branch, validate);
  return validate;
}

function runBranch(schemaId: string, branch: unknown, data: unknown): AjvError[] {
  if (branch === null || typeof branch !== 'object') {
    return [];
  }
  const validate = branchValidator(schemaId, branch);
  if (validate(data)) {
    return [];
  }
  return (validate.errors ?? []).map((error) => ({ ...error }));
}

function isDirectEnumBranch(errors: readonly AjvError[]): boolean {
  return (
    errors.length > 0 &&
    errors.every((error) => {
      if (error.keyword !== 'const' && error.keyword !== 'enum') {
        return false;
      }
      return error.instancePath === '' || error.instancePath === '/';
    })
  );
}

function allowedFrom(errors: readonly AjvError[]): unknown[] {
  const seen = new Set<string>();
  const values: unknown[] = [];
  for (const error of errors) {
    const params = error.params as { allowedValue?: unknown; allowedValues?: unknown[] };
    const batch = Array.isArray(params.allowedValues)
      ? params.allowedValues
      : 'allowedValue' in params
        ? [params.allowedValue]
        : [];
    for (const value of batch) {
      const key = JSON.stringify(value);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      values.push(value);
    }
  }
  return values;
}

function collapsedEnum(parent: AjvError, branchErrors: readonly AjvError[]): AjvError {
  return {
    keyword: 'enum',
    instancePath: parent.instancePath,
    schemaPath: parent.schemaPath,
    message: 'must be equal to one of the allowed values',
    params: { allowedValues: allowedFrom(branchErrors) },
    data: parent.data,
  };
}

function branchDepth(errors: readonly AjvError[]): number {
  let depth = 0;
  for (const error of errors) {
    depth = Math.max(depth, error.instancePath.length);
  }
  return depth;
}

function discriminatorMisses(errors: readonly AjvError[]): number {
  return errors.filter((error) => {
    if (error.keyword !== 'required') {
      return false;
    }
    return error.instancePath === '' || error.instancePath === '/';
  }).length;
}

function isCompanion(error: AjvError): boolean {
  return error.keyword === 'if' || error.keyword === 'unevaluatedProperties';
}

function sameOrUnder(base: string, path: string): boolean {
  if (base === '') {
    return true;
  }
  return path === base || path.startsWith(`${base}/`);
}

/** True when a nested error already explains this companion. */
function companionExplained(error: AjvError, errors: readonly AjvError[]): boolean {
  if (error.keyword === 'unevaluatedProperties') {
    const name = (error.params as { unevaluatedProperty?: unknown }).unevaluatedProperty;
    if (typeof name === 'string') {
      const prefix = joinInstancePath(error.instancePath ?? '', `/${name}`);
      return errors.some((other) => {
        if (other === error || isCompanion(other)) {
          return false;
        }
        const path = other.instancePath ?? '';
        return path === prefix || path.startsWith(`${prefix}/`);
      });
    }
  }
  return errors.some(
    (other) =>
      other !== error &&
      !isCompanion(other) &&
      sameOrUnder(error.instancePath ?? '', other.instancePath ?? '')
  );
}

function dropCompanionErrors(errors: readonly AjvError[]): AjvError[] {
  return errors.filter((error) => !isCompanion(error) || !companionExplained(error, errors));
}

function isBetterBranch(candidate: readonly AjvError[], current: readonly AjvError[]): boolean {
  const candidateMisses = discriminatorMisses(candidate);
  const currentMisses = discriminatorMisses(current);
  if (candidateMisses !== currentMisses) {
    return candidateMisses < currentMisses;
  }
  if (candidate.length !== current.length) {
    return candidate.length < current.length;
  }
  return branchDepth(candidate) > branchDepth(current);
}

/**
 * Select the oneOf/anyOf branch that explains the failure, and collapse a
 * const/enum anyOf into a single enum error.
 */
export function refineSchemaErrors(
  errors: readonly ErrorObject[],
  schemaId: string
): ErrorObject[] {
  const skipped = new Set<string>();
  let current: AjvError[] = errors.map((error) => ({ ...error }));

  for (let step = 0; step < MAX_COMBINATORS; step++) {
    const parent = deepestCombinator(current, skipped);
    if (parent === undefined) {
      return dropCompanionErrors(current);
    }
    skipped.add(combinatorKey(parent));
    const branches = combinatorBranches(parent) ?? [];
    const refined = branches.map(
      (branch) =>
        refineSchemaErrors(runBranch(schemaId, branch, parent.data), schemaId) as AjvError[]
    );
    const failing = refined.filter((list) => list.length > 0);

    if (failing.length === 0 || failing.length < branches.length) {
      current = current.filter((error) => error === parent || !belongsTo(error, parent));
      continue;
    }

    if (failing.every(isDirectEnumBranch)) {
      current = [
        ...current.filter((error) => !belongsTo(error, parent)),
        collapsedEnum(parent, failing.flat()),
      ];
      continue;
    }

    let best = failing[0] ?? [];
    for (const list of failing.slice(1)) {
      if (isBetterBranch(list, best)) {
        best = list;
      }
    }
    current = [
      ...current.filter((error) => !belongsTo(error, parent)),
      ...best.map((error) => rebase(parent.instancePath ?? '', error)),
    ];
  }

  return dropCompanionErrors(current);
}
