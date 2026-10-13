import type { Options, ValidateFunction } from 'ajv';
import * as addFormatsModule from 'ajv-formats';
import * as Ajv2020Module from 'ajv/dist/2020.js';
import { ADDRESS_RE } from '../util';

type Ajv = import('ajv').default;
type Ajv2020Ctor = new (opts?: Options) => Ajv;
type AddFormatsFn = typeof import('ajv-formats').default;

function cjsDefault<T>(mod: T): T extends { default: infer D } ? D : T {
  if (typeof mod === 'object' && mod !== null && 'default' in mod) {
    return (mod as { default: T extends { default: infer D } ? D : T }).default;
  }
  return mod as T extends { default: infer D } ? D : T;
}

let shared: Ajv | undefined;

/** Ajv configured for ERC-7730 descriptors and tests files. */
export function createAjv(options?: { verbose?: boolean }): Ajv {
  const Ajv2020 = cjsDefault(Ajv2020Module) as unknown as Ajv2020Ctor;
  const addFormats = cjsDefault(addFormatsModule) as unknown as AddFormatsFn;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
    unicodeRegExp: true,
    verbose: options?.verbose === true,
  });
  addFormats(ajv);
  // Official files use mixed-case checksums and lowercase hex; both are accepted.
  ajv.addFormat('eip55', {
    type: 'string',
    validate: (value: string) => ADDRESS_RE.test(value),
  });
  ajv.addFormat('eip155', {
    type: 'number',
    validate: (value: number) => Number.isInteger(value) && value >= 0,
  });
  return ajv;
}

/** One Ajv instance for descriptors and tests files, built on first use. */
function sharedAjv(): Ajv {
  // verbose so a failed oneOf can be rechecked per branch and name the bad value.
  shared ??= createAjv({ verbose: true });
  return shared;
}

function compile(schema: object, id?: string): ValidateFunction {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    // v1 is published as draft-04; omit $schema so Ajv 2020 can compile it.
    if (key !== '$schema') {
      copy[key] = value;
    }
  }
  if (id !== undefined && copy.$id === undefined) {
    copy.$id = id;
  }
  return sharedAjv().compile(copy);
}

/** Compile a branch schema on the Ajv instance that already holds the root schema. */
export function compileSharedSchema(schema: object): ValidateFunction {
  return sharedAjv().compile(schema);
}

/** Compile `schema` on the first call and reuse the validator after that. */
export function lazyValidator(schema: object, id?: string): () => ValidateFunction {
  let validate: ValidateFunction | undefined;
  return () => {
    validate ??= compile(schema, id);
    return validate;
  };
}
