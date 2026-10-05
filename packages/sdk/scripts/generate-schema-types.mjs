#!/usr/bin/env node
/**
 * Generate TypeScript input types from the official ERC-7730 v2 JSON Schema.
 *
 * Usage: node packages/sdk/scripts/generate-schema-types.mjs
 * (also: pnpm schema:types from the monorepo root)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCHEMA_PATH = join(ROOT, 'src/schema/official/erc7730-v2.schema.json');
const OUT_PATH = join(ROOT, 'src/types/generated/erc7730-v2.ts');

const SECTION_KEYS = ['$context', '$metadata', '$display', '$format', '$definitions'];

const PARAM_DEF_NAMES = [
  'format_addressNameParameters',
  'format_interoperableAddressNameParameters',
  'format_calldataParameters',
  'format_tokenAmountParameters',
  'format_tokenTickerParameters',
  'format_nftNameParameters',
  'format_dateParameters',
  'format_unitParameters',
  'format_enumParameters',
];

/**
 * @param {unknown} node
 */
function rewriteRefs(node) {
  if (Array.isArray(node)) {
    for (const item of node) rewriteRefs(item);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = /** @type {Record<string, unknown>} */ (node);
  if (typeof record.$ref === 'string') {
    const match = record.$ref.match(/^#\/\$(context|metadata|display|format|definitions)\/(.+)$/);
    if (match) {
      record.$ref = `#/$defs/${match[1]}_${match[2]}`;
    }
  }
  for (const value of Object.values(record)) rewriteRefs(value);
}

/**
 * Drop validation-only combinators that collapse objects to index signatures.
 * Keys must be removed (not set to undefined) so json-schema-to-typescript
 * does not try to `.map` over an undefined combinator.
 * @param {Record<string, unknown>} def
 */
function keepObjectShape(def) {
  for (const key of ['allOf', 'anyOf', 'oneOf', 'not', 'unevaluatedProperties']) {
    if (key in def) {
      Reflect.deleteProperty(def, key);
    }
  }
}

/**
 * @param {string} ref
 * @param {Record<string, Record<string, unknown>>} defs
 */
function resolveLocalRef(ref, defs) {
  const match = ref.match(/^#\/\$defs\/(.+)$/);
  if (!match) return undefined;
  return defs[match[1]];
}

/**
 * Distribute sibling `properties` onto each `oneOf` branch (e.g. context `$id`).
 * @param {Record<string, unknown>} def
 * @param {Record<string, Record<string, unknown>>} defs
 */
function distributePropertiesOntoOneOf(def, defs) {
  if (!Array.isArray(def.oneOf) || !def.properties || typeof def.properties !== 'object') {
    return;
  }
  const shared = /** @type {Record<string, unknown>} */ (def.properties);
  def.oneOf = def.oneOf.map((branch, index) => {
    if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
      return branch;
    }
    const raw = /** @type {Record<string, unknown>} */ (branch);
    const resolved =
      typeof raw.$ref === 'string'
        ? resolveLocalRef(raw.$ref, defs)
        : /** @type {Record<string, unknown>} */ (raw);
    if (!resolved) return branch;
    const merged = structuredClone(resolved);
    keepObjectShape(merged);
    merged.type = 'object';
    merged.properties = {
      ...structuredClone(shared),
      ...(typeof merged.properties === 'object' &&
      merged.properties &&
      !Array.isArray(merged.properties)
        ? merged.properties
        : {}),
    };
    merged.additionalProperties = false;
    merged.title = index === 0 ? 'ContractContextBranch' : 'EIP712ContextBranch';
    return merged;
  });
  Reflect.deleteProperty(def, 'properties');
  Reflect.deleteProperty(def, 'unevaluatedProperties');
}

/**
 * @param {Record<string, Record<string, unknown>>} defs
 */
function simplifyForTypescript(defs) {
  if (defs.context_main) {
    distributePropertiesOntoOneOf(defs.context_main, defs);
    defs.context_main.title = 'ERC7730V2Context';
  }

  for (const name of PARAM_DEF_NAMES) {
    const def = defs[name];
    if (!def) continue;
    keepObjectShape(def);
  }

  if (defs.format_mapReference) {
    keepObjectShape(defs.format_mapReference);
    defs.format_mapReference.title = 'MapReference';
  }

  const field = defs.format_field;
  if (field) {
    keepObjectShape(field);
    field.properties = {
      ...(typeof field.properties === 'object' &&
      field.properties &&
      !Array.isArray(field.properties)
        ? field.properties
        : {}),
      params: {
        title: 'FieldParams',
        anyOf: PARAM_DEF_NAMES.map((name) => ({ $ref: `#/$defs/${name}` })),
      },
    };
    field.additionalProperties = false;
    field.title = 'DisplayField';
  }

  if (defs.format_rules) {
    const rules = defs.format_rules;
    if (Array.isArray(rules.oneOf) && rules.oneOf[1] && typeof rules.oneOf[1] === 'object') {
      keepObjectShape(/** @type {Record<string, unknown>} */ (rules.oneOf[1]));
    }
    rules.title = 'DisplayRule';
  }

  if (defs.display_reference) {
    keepObjectShape(defs.display_reference);
    defs.display_reference.title = 'FieldReference';
    defs.display_reference.additionalProperties = false;
  }

  if (defs.display_fieldGroup) {
    keepObjectShape(defs.display_fieldGroup);
    defs.display_fieldGroup.title = 'FieldGroup';
  }

  if (defs.metadata_main) defs.metadata_main.title = 'ERC7730V2Metadata';
  if (defs.display_main) defs.display_main.title = 'ERC7730V2Display';
  if (defs.metadata_token) defs.metadata_token.title = 'TokenDescription';
  if (defs.metadata_info) defs.metadata_info.title = 'ERC7730V2OwnerInfo';
  if (defs.format_names) defs.format_names.title = 'ERC7730V2FieldFormat';
  if (defs.context_deployments) defs.context_deployments.title = 'DeploymentList';
  if (defs.context_contract) {
    keepObjectShape(defs.context_contract);
    defs.context_contract.title = 'ContractBindingContext';
  }
  if (defs.context_EIP712) {
    keepObjectShape(defs.context_EIP712);
    defs.context_EIP712.title = 'EIP712BindingContext';
  }
  if (defs.display_fields) defs.display_fields.title = 'DisplayFieldItemList';
  if (defs.format_encryptionParameters) {
    defs.format_encryptionParameters.title = 'EncryptionParameters';
  }
}

/**
 * @param {Record<string, unknown>} schema
 */
function preprocess(schema) {
  const out = structuredClone(schema);
  const defs = {
    ...(out.$defs && typeof out.$defs === 'object' && !Array.isArray(out.$defs)
      ? /** @type {Record<string, Record<string, unknown>>} */ (out.$defs)
      : {}),
  };

  for (const key of SECTION_KEYS) {
    const section = out[key];
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    for (const [name, value] of Object.entries(section)) {
      defs[`${key.slice(1)}_${name}`] = /** @type {Record<string, unknown>} */ (value);
    }
    Reflect.deleteProperty(out, key);
  }

  out.$defs = defs;
  rewriteRefs(out);
  simplifyForTypescript(/** @type {Record<string, Record<string, unknown>>} */ (out.$defs));
  rewriteRefs(out);

  out.title = 'InputDescriptor';
  out.description =
    'ERC-7730 descriptor document accepted by the official v2 JSON Schema. Top-level sections may be omitted when provided via includes.';
  return out;
}

/**
 * Stable renames after codegen (generator titles are not always honored for unions).
 * @param {string} source
 */
function postprocess(source) {
  let next = source;
  // Prefer the schema-oriented public name for the format enum union.
  next = next.replace(/export type FieldFormat = \(/, 'export type ERC7730V2FieldFormat = (');
  next = next.replaceAll('format?: FieldFormat;', 'format?: ERC7730V2FieldFormat;');
  // Drop spurious `| undefined` members sometimes emitted for field lists.
  next = next.replaceAll('DisplayField | undefined | FieldGroup', 'DisplayField | FieldGroup');
  next = next.replaceAll(
    '(DisplayField | undefined | FieldGroup | FieldReference)[]',
    '(DisplayField | FieldGroup | FieldReference)[]'
  );
  return next;
}

const BANNER = `/**
 * Generated from packages/sdk/src/schema/official/erc7730-v2.schema.json.
 * DO NOT EDIT. Run \`pnpm schema:types\` to regenerate.
 */`;

async function main() {
  const raw = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const schema = preprocess(raw);
  const compiled = await compile(schema, 'InputDescriptor', {
    bannerComment: BANNER,
    unreachableDefinitions: false,
    unknownAny: true,
    style: { semi: true, singleQuote: true, trailingComma: 'all' },
    additionalProperties: false,
    strictIndexSignatures: true,
  });
  const output = `${postprocess(compiled).trimEnd()}\n`;
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, output, 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
