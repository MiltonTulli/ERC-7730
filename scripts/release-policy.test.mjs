import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkCadence,
  checkPromotion,
  checkVersion,
  compareStable,
  releaseChannel,
} from './release-policy.mjs';

test('branch and Changesets state determine the only allowed npm channel', () => {
  assert.equal(releaseChannel('main'), 'latest');
  assert.equal(releaseChannel('next', { mode: 'pre', tag: 'next' }), 'next');
  for (const branch of ['feature', 'sdk-v1.0.0']) assert.throws(() => releaseChannel(branch));
  assert.throws(() => releaseChannel('main', { mode: 'exit', tag: 'next' }));
  assert.throws(() => releaseChannel('next'));
  assert.throws(() => releaseChannel('next', { mode: 'pre', tag: 'beta' }));
  assert.throws(() => releaseChannel('next', { mode: 'exit', tag: 'next' }));
});

test('prereleases never reach latest, and next cannot create stable versions', () => {
  checkVersion('1.0.0', 'latest', false);
  checkVersion('1.0.0-next.0', 'next', false);
  checkVersion('0.4.1', 'next', true); // Unchanged CLI is skipped.
  for (const version of ['1.0.0-next.0', '1.0.0-beta.0', '1.0.0+build']) {
    assert.throws(() => checkVersion(version, 'latest', false));
  }
  for (const version of ['1.0.0', '1.0.0-beta.0', '1.0.0-next.01', '01.0.0-next.0']) {
    assert.throws(() => checkVersion(version, 'next', false));
  }
});

test('weekly cadence is advisory; recent feature releases still require promotion', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const recent = { '0.12.0': '2026-10-12T12:00:00Z' };
  assert.equal(checkCadence('1.0.0', recent, now), true);
  assert.equal(checkCadence('1.0.1', recent, now), true);
  checkCadence('0.12.1', recent, now);
  checkCadence('0.12.2', { ...recent, '0.12.1': '2026-10-16T11:00:00Z' }, now);
  checkCadence(
    '1.0.0',
    {
      '0.12.0': '2026-10-09T12:00:00Z',
      '0.12.1': '2026-10-16T11:00:00Z',
      '1.0.0-next.0': '2026-10-16T11:00:00Z',
      modified: '2026-10-16T11:00:00Z',
    },
    now
  );
});

test('stable majors/minors require a same-version candidate, full commit and review notes', () => {
  const promotion = {
    candidate: '1.0.0-next.3',
    commit: 'a'.repeat(40),
    notes: 'Wallet migration reviewed.',
  };
  checkPromotion('1.0.0', promotion);
  assert.throws(() => checkPromotion('1.0.0'));
  for (const override of [{ candidate: '0.13.0-next.0' }, { commit: 'abc123' }, { notes: '' }]) {
    assert.throws(() => checkPromotion('1.0.0', { ...promotion, ...override }));
  }
  assert.ok(compareStable('1.0.0', '0.12.0') > 0);
  assert.ok(compareStable('0.12.0', '0.12.1') < 0);
});
