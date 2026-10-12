import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasNestedUnboundedQuantifier,
  nestedQuantifierMessages,
} from './check-nested-quantifiers.mjs';

test('flags a quantified group that contains a quantifier', () => {
  assert.equal(hasNestedUnboundedQuantifier('(?:\\[\\d*\\])+'), true);
  assert.equal(hasNestedUnboundedQuantifier('^((?:\\[\\d*\\])+)\\s*(.*)$'), true);
});

test('allows a single quantifier and a bounded group', () => {
  assert.equal(hasNestedUnboundedQuantifier('\\[(\\d*)\\]$'), false);
  assert.equal(hasNestedUnboundedQuantifier('\\s+'), false);
  assert.equal(hasNestedUnboundedQuantifier('(.*)?'), false);
  assert.equal(hasNestedUnboundedQuantifier('^(.*)(\\[\\d*\\])$'), false);
});

test('a fixed-width inner quantifier is not polynomial', () => {
  assert.equal(hasNestedUnboundedQuantifier('\\B(?=(\\d{3})+(?!\\d))'), false);
  assert.equal(hasNestedUnboundedQuantifier('^0x(?:[0-9a-fA-F]{2})*$'), false);
});

test('reports the source line of a regex literal', () => {
  const source = 'const ok = /\\s+/;\nconst bad = /(?:\\[\\d*\\])+/;\n';
  const messages = nestedQuantifierMessages(source, 'abi.ts');
  assert.deepEqual(messages, ['abi.ts:2: nested quantifier /(?:\\[\\d*\\])+/']);
});
