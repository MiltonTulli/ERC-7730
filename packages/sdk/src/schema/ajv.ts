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

/** One Ajv instance for descriptors and tests files, built on first use. */
function sharedAjv(): Ajv {
  if (shared) {
    return shared;
  }
  const Ajv2020 = cjsDefault(Ajv2020Module) as unknown as Ajv2020Ctor;
  const addFormats = cjsDefault(addFormatsModule) as unknown as AddFormatsFn;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
    unicodeRegExp: true,
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
  shared = ajv;
  return ajv;
}

function compile(schema: object): ValidateFunction {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    // v1 is published as draft-04; omit $schema so Ajv 2020 can compile it.
    if (key !== '$schema') {
      copy[key] = value;
    }
  }
  return sharedAjv().compile(copy);
}

/** Compile `schema` on the first call and reuse the validator after that. */
export function lazyValidator(schema: object): () => ValidateFunction {
  let validate: ValidateFunction | undefined;
  return () => {
    validate ??= compile(schema);
    return validate;
  };
}
