import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripSchemaAnnotations } from '../../scripts/strip-schema-annotations.mjs';
import { createAjv } from '../schema/ajv';
import testsSchema from '../schema/official/erc7730-tests-v2.schema.json' with { type: 'json' };
import v1Schema from '../schema/official/erc7730-v1.schema.json' with { type: 'json' };
import v2Schema from '../schema/official/erc7730-v2.schema.json' with { type: 'json' };

const here = dirname(fileURLToPath(import.meta.url));
const officialDir = join(here, 'fixtures/official');

function loadJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function compile(schema: object) {
  const { $schema: _ignored, ...rest } = schema as Record<string, unknown>;
  return createAjv().compile(rest);
}

function mutations(doc: Record<string, unknown>): unknown[] {
  const { display: _display, ...withoutDisplay } = doc;
  const { context: _context, ...withoutContext } = doc;
  return [
    doc,
    withoutDisplay,
    withoutContext,
    { ...doc, context: 5 },
    { ...doc, display: { formats: { 'transfer(address,uint256)': { fields: 'nope' } } } },
    { ...doc, metadata: { owner: 7, info: { url: 'not a url' } } },
    { ...doc, unknownTopLevel: true },
    {},
  ];
}

const fixtures = [
  ...readdirSync(officialDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => loadJson(join(officialDir, name))),
  loadJson(join(here, 'fixtures/v1/erc20-transfer.json')),
];

describe('stripSchemaAnnotations', () => {
  it('removes text annotations but keeps property and $ref target names', () => {
    const schema = {
      title: 'Root',
      description: 'Root schema',
      $display: { title: { type: 'string', description: 'kept target' } },
      properties: {
        title: { type: 'string', description: 'dropped', examples: ['x'] },
        description: { const: { description: 'data' } },
      },
      required: ['title', 'description'],
    };
    expect(stripSchemaAnnotations(schema)).toEqual({
      $display: { title: { type: 'string' } },
      properties: {
        title: { type: 'string' },
        description: { const: { description: 'data' } },
      },
      required: ['title', 'description'],
    });
  });

  it.each([
    ['v2', v2Schema],
    ['v1', v1Schema],
    ['tests-v2', testsSchema],
  ])('%s: stripped schema validates fixtures exactly like the official one', (_name, schema) => {
    const full = compile(schema);
    const stripped = compile(stripSchemaAnnotations(schema));
    expect(JSON.stringify(stripSchemaAnnotations(schema))).not.toMatch(/"description":"/);
    for (const doc of fixtures) {
      for (const input of mutations(doc)) {
        expect(stripped(input)).toBe(full(input));
        expect(stripped.errors ?? null).toEqual(full.errors ?? null);
      }
    }
  });
});
