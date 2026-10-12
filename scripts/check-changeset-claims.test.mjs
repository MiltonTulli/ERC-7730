import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimsMissingFromDiff,
  dependencyNames,
  parseChangeset,
} from './check-changeset-claims.mjs';

test('a dependency named in the prose must appear in the diff', () => {
  const body = 'Drop abitype from the ABI parser.\n';
  assert.deepEqual(claimsMissingFromDiff(body, 'other work', ['abitype', 'viem'], []), ['abitype']);
  assert.deepEqual(claimsMissingFromDiff(body, '-    "abitype": "^1.0.0"', ['abitype'], []), []);
});

test('the frontmatter package is not a claim about the diff', () => {
  const parsed = parseChangeset('---\n"@erc7730/sdk": patch\n---\n\nLinear array-suffix scan.\n');
  assert.deepEqual(parsed.packages, ['@erc7730/sdk']);
  assert.deepEqual(claimsMissingFromDiff(parsed.body, '', ['viem'], parsed.packages), []);
});

test('a subpath that is not the frontmatter target must be in the diff', () => {
  const body = 'Moved to `@erc7730/sdk/legacy`.\n';
  assert.deepEqual(claimsMissingFromDiff(body, '', [], ['@erc7730/sdk']), ['@erc7730/sdk/legacy']);
  assert.deepEqual(
    claimsMissingFromDiff(body, "export * from '@erc7730/sdk/legacy'", [], ['@erc7730/sdk']),
    []
  );
});

test('dependency names come from every dependency table', () => {
  const names = dependencyNames(
    JSON.stringify({ dependencies: { ajv: '1' }, devDependencies: { viem: '2' } })
  );
  assert.deepEqual(names, ['ajv', 'viem']);
});
