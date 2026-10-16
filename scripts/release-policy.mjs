import assert from 'node:assert/strict';

export const packages = ['sdk', 'cli'];
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const next = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-next\.(0|[1-9]\d*)$/;

export function releaseChannel(branch, pre) {
  assert.ok(['main', 'next'].includes(branch), 'Releases require main or next');
  if (branch === 'next') {
    assert.ok(pre?.mode === 'pre' && pre.tag === 'next', 'next requires Changesets pre enter next');
    return 'next';
  }
  assert.equal(pre, undefined, 'main must exit Changesets prerelease mode before publishing');
  return 'latest';
}

export function checkVersion(version, channel, published) {
  if (channel === 'latest') {
    assert.match(version, stable, 'main cannot publish prereleases');
  } else if (stable.test(version)) {
    assert.ok(published, 'next cannot publish a new stable version');
  } else {
    assert.match(version, next, 'next only publishes X.Y.Z-next.N');
  }
}

export function checkCadence(version, times, now = Date.now()) {
  assert.match(version, stable);
  const history = Object.keys(times)
    .filter((v) => stable.test(v))
    .sort(compareStable);
  const series = (v) => v.split('.').slice(0, 2).join('.');
  if (history.length && series(history.at(-1)) === series(version)) return false;
  for (const [index, released] of history.entries()) {
    if (index > 0 && series(history[index - 1]) === series(released)) continue;
    const time = times[released];
    const publishedAt = Date.parse(time);
    assert.ok(Number.isFinite(publishedAt), `Invalid npm publication time for ${released}`);
    assert.ok(
      now - publishedAt >= 7 * 24 * 60 * 60 * 1000,
      `Weekly cadence: ${released} shipped at ${time}; wait seven days before ${version}`
    );
  }
  return true;
}

export function checkPromotion(version, promotion) {
  assert.ok(promotion, `Stable ${version} needs reviewed promotion evidence`);
  assert.match(promotion.candidate, next, 'Promotion candidate must be a next version');
  assert.equal(
    promotion.candidate.split('-')[0],
    version,
    'Candidate must target this stable version'
  );
  assert.match(promotion.commit, /^[0-9a-f]{40}$/, 'Candidate commit must be a full SHA');
  assert.ok(promotion.notes?.trim(), 'Explain additional changes and wallet/migration impact');
}

export function compareStable(a, b) {
  assert.match(a, stable);
  assert.match(b, stable);
  const aa = a.split('.').map(Number);
  const bb = b.split('.').map(Number);
  return aa[0] - bb[0] || aa[1] - bb[1] || aa[2] - bb[2];
}
