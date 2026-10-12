import assert from 'node:assert/strict';
import test from 'node:test';
import { chainedExtendHits, typescriptFences } from './check-doc-snippets.mjs';

test('flags a chained extend and allows the two-statement form', () => {
  const bad = 'use `createOfficialRegistry({ pin }).extend()` in the sdk';
  assert.deepEqual(chainedExtendHits(bad), ['1']);
  const good = [
    'const registry = createOfficialRegistry({ pin });',
    'registry.extend(descriptors);',
  ].join('\n');
  assert.deepEqual(chainedExtendHits(good), []);
});

test('a continues mark on the fence skips pasteable typechecking', () => {
  const source = [
    '<!-- snippet: continues -->',
    '```ts',
    'registry.extend(local);',
    '```',
    '```ts',
    'const registry = createOfficialRegistry();',
    '```',
  ].join('\n');
  const fences = typescriptFences(source);
  assert.equal(fences[0]?.continues, true);
  assert.equal(fences[1]?.continues, false);
});
