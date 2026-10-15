import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { missingTsdoc, parseModule } from './check-tsdoc.mjs';

test('a blank line detaches a file comment from the first export', () => {
  const parsed = parseModule(`/**
 * File header.
 */

export function bare() {}

/** Does a thing. */
export function documented() {}
`);
  assert.equal(parsed.declarations.get('bare')?.documented, false);
  assert.equal(parsed.declarations.get('documented')?.documented, true);
});

test('an empty TSDoc block does not count as a summary', () => {
  const parsed = parseModule('/** */\nexport function undocumented() {}\n');
  assert.equal(parsed.declarations.get('undocumented')?.documented, false);
});

test('a deprecated export with a migration reason is documented', () => {
  const parsed = parseModule('/** @deprecated Use replacement. */\nexport function legacy() {}\n');
  assert.equal(parsed.declarations.get('legacy')?.documented, true);
});

test('a regex that contains // does not hide the next export', () => {
  const parsed = parseModule(`export function pointer(value: string): string {
  return \`\${value}/\${value.replace(/\\//g, '~1')}\`;
}

/** Visible. */
export function afterRegex() {}
`);
  assert.equal(parsed.declarations.get('afterRegex')?.documented, true);
});

test('root exports follow re-exports, stars, and aliases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tsdoc-'));
  const src = join(dir, 'packages/sdk/src');
  mkdirSync(join(src, 'nested'), { recursive: true });
  mkdirSync(join(src, 'barrel'), { recursive: true });
  writeFileSync(
    join(src, 'index.ts'),
    `export { kept, renamed as alias } from './nested';\nexport type { Starred } from './types';\nexport * from './barrel';\n`
  );
  writeFileSync(
    join(src, 'nested/index.ts'),
    'export function kept() {}\n/** Renamed value. */\nexport const renamed = 1;\n'
  );
  writeFileSync(join(src, 'barrel/index.ts'), `export * from '../wildcard';\n`);
  writeFileSync(
    join(src, 'wildcard.ts'),
    '/** Exported through two barrels. */\nexport function fromStar() {}\nexport function missingFromStar() {}\n'
  );
  writeFileSync(join(src, 'types.ts'), `export type { Starred } from './generated';\n`);
  writeFileSync(
    join(src, 'generated.ts'),
    '/** From the schema. */\nexport type Starred = string;\n'
  );

  const missing = missingTsdoc(dir, ['packages/sdk/src/index.ts']);
  assert.deepEqual(missing, [
    'packages/sdk/src/index.ts: kept (packages/sdk/src/nested/index.ts) has no TSDoc summary',
    'packages/sdk/src/index.ts: missingFromStar (packages/sdk/src/wildcard.ts) has no TSDoc summary',
  ]);
});
