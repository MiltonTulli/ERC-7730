import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkCadence,
  checkPromotion,
  checkVersion,
  compareStable,
  packages,
  releaseChannel,
} from './release-policy.mjs';
import {
  npmView,
  packPublishedTarball,
  versionExists,
  waitForRegistry,
} from './release-registry.mjs';

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', ...options })?.trim() ?? '';
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const metadata = (name) => JSON.parse(npmView(name, ['dist-tags', 'time']));
const directory = '.release-evidence';
mkdirSync(directory, { recursive: true });

async function verifyProvenance(pkg, version, expectedCommit, saveTarball = false) {
  const stage = mkdtempSync(join(tmpdir(), 'erc7730-provenance-'));
  try {
    await packPublishedTarball(`@erc7730/${pkg}`, version, stage);
    const tarball = join(stage, `erc7730-${pkg}-${version}.tgz`);
    const commit = run('bash', [
      'scripts/resolve-publication-commit.sh',
      tarball,
      `@erc7730/${pkg}`,
      version,
    ]);
    assert.match(commit, /^[0-9a-f]{40}$/, 'Provenance must resolve a single publication commit');
    if (expectedCommit) {
      assert.equal(commit, expectedCommit, 'npm provenance must match the tested candidate commit');
    }
    if (saveTarball) copyFileSync(tarball, `packages/${pkg}/erc7730-${pkg}-${version}.tgz`);
    return commit;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

async function preflight() {
  const branch = process.env.GITHUB_REF_NAME;
  const pre = existsSync('.changeset/pre.json') ? json('.changeset/pre.json') : undefined;
  // After stable promotion, next is idle until new changesets enter pre mode.
  const idleNext = branch === 'next' && pre === undefined;
  const channel = idleNext ? 'next' : releaseChannel(branch, pre);
  const promotions = existsSync('.github/release-promotion.json')
    ? json('.github/release-promotion.json')
    : {};
  const releases = JSON.parse(
    run('gh', ['release', 'list', '--limit', '1000', '--json', 'tagName'])
  );
  const evidence = { commit: process.env.GITHUB_SHA, branch, channel, packages: {} };
  assert.match(evidence.commit, /^[0-9a-f]{40}$/);
  for (const pkg of packages) {
    const { name, version } = json(`packages/${pkg}/package.json`);
    const before = metadata(name); // Fail closed on registry errors, including cadence queries.
    const published = await waitForRegistry(
      () => versionExists(name, version),
      `${name}@${version} visibility before publication`
    );
    if (idleNext) {
      assert.match(version, /^\d+\.\d+\.\d+$/, 'Idle next requires stable versions');
      assert.ok(published, 'Idle next may only contain already-published stable versions');
    }
    checkVersion(version, channel, published);
    const skipStableOnNext = channel === 'next' && !version.includes('-');
    const createRelease =
      !skipStableOnNext && !releases.some((r) => r.tagName === `${pkg}-v${version}`);
    const needsVerification = !published || createRelease;
    const entry = { name, version, published, createRelease, needsVerification, before };
    if (!published && channel === 'latest') {
      assert.ok(compareStable(version, before['dist-tags'].latest) > 0, 'Refuse to regress latest');
      if (checkCadence(version, before.time)) {
        checkPromotion(version, promotions[name]);
        const promotion = promotions[name];
        await verifyProvenance(pkg, promotion.candidate, promotion.commit);
        const tag = `${pkg}-v${promotion.candidate}`;
        assert.equal(run('git', ['rev-parse', `${tag}^{commit}`]), promotion.commit);
        run('git', ['merge-base', '--is-ancestor', promotion.commit, evidence.commit]);
        const release = JSON.parse(run('gh', ['release', 'view', tag, '--json', 'isPrerelease']));
        assert.equal(release.isPrerelease, true, 'Candidate must have a prerelease GitHub Release');
        // Reinstall the exact published candidate before stable checks and publication.
        consumerSmoke(pkg, promotion.candidate);
        entry.promotion = {
          ...promotion,
          additionalCommits: run('git', [
            'log',
            '--format=%H %s',
            `${promotion.commit}..${evidence.commit}`,
          ])
            .split('\n')
            .filter(Boolean),
        };
      }
    }
    evidence.packages[pkg] = entry;
  }
  writeFileSync(`${directory}/before.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    const outputs = [`channel=${channel}`];
    for (const [pkg, entry] of Object.entries(evidence.packages)) {
      outputs.push(
        `${pkg}_version=${entry.version}`,
        `${pkg}_publish=${!entry.published}`,
        `${pkg}_release=${entry.createRelease}`
      );
    }
    writeFileSync(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`, { flag: 'a' });
  }
}

function consumerSmoke(pkg, version) {
  if (pkg === 'sdk') {
    run(process.execPath, ['scripts/sdk-consumer-install.mjs'], {
      env: { ...process.env, SDK_PACKAGE: `@erc7730/sdk@${version}` },
      stdio: 'inherit',
    });
    return;
  }
  const stage = mkdtempSync(join(tmpdir(), 'erc7730-cli-published-'));
  try {
    writeFileSync(join(stage, 'package.json'), '{"private":true}');
    run(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', `@erc7730/cli@${version}`],
      { cwd: stage }
    );
    assert.equal(run(join(stage, 'node_modules/.bin/erc7730'), ['--version']), version);
    assert.ok(run(join(stage, 'node_modules/.bin/erc7730'), ['--help']).includes('generate'));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

async function verify() {
  const evidence = json(`${directory}/before.json`);
  for (const [pkg, entry] of Object.entries(evidence.packages)) {
    const after = await waitForRegistry(() => {
      if (!versionExists(entry.name, entry.version)) return false;
      const snapshot = metadata(entry.name);
      if (evidence.channel === 'next') {
        assert.equal(
          snapshot['dist-tags'].latest,
          entry.before['dist-tags'].latest,
          'Prerelease changed latest'
        );
      }
      if (!entry.published && snapshot['dist-tags'][evidence.channel] !== entry.version)
        return false;
      if (entry.needsVerification) {
        const attestation = npmView(`${entry.name}@${entry.version}`, ['dist.attestations.url']);
        const url = attestation ? JSON.parse(attestation) : undefined;
        if (url == null || url === '') return false;
        assert.equal(typeof url, 'string', 'Unexpected npm attestation URL');
      }
      return snapshot;
    }, `${entry.name}@${entry.version} version, npm tag and provenance metadata`);
    assert.ok(after, `npm publication did not propagate: ${entry.name}@${entry.version}`);
    if (entry.needsVerification) {
      entry.publicationCommit = await verifyProvenance(
        pkg,
        entry.version,
        entry.published ? undefined : evidence.commit,
        entry.createRelease
      );
      consumerSmoke(pkg, entry.version);
      entry.smoke = 'passed';
      entry.provenance = 'verified';
    }
    entry.after = after;
  }
  writeFileSync(`${directory}/verified.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    for (const [pkg, entry] of Object.entries(evidence.packages)) {
      if (entry.createRelease) {
        writeFileSync(process.env.GITHUB_OUTPUT, `${pkg}_commit=${entry.publicationCommit}\n`, {
          flag: 'a',
        });
      }
    }
  }
}

function complete() {
  const evidence = json(`${directory}/verified.json`);
  for (const [pkg, entry] of Object.entries(evidence.packages)) {
    if (!entry.createRelease) continue;
    const tag = `${pkg}-v${entry.version}`;
    run('git', ['fetch', 'origin', 'tag', tag]);
    const commit = run('git', ['rev-parse', `${tag}^{commit}`]);
    assert.equal(commit, entry.publicationCommit, 'Git tag must match verified npm provenance');
    const release = JSON.parse(run('gh', ['release', 'view', tag, '--json', 'isPrerelease']));
    assert.equal(release.isPrerelease, evidence.channel === 'next');
    entry.gitTag = { tag, commit, prerelease: release.isPrerelease };
  }
  writeFileSync(`${directory}/released.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Verified ${evidence.channel} publication\n\nCommit: ${evidence.commit}\n\n\`released.json\` in the release-evidence artifact contains package versions, npm tags, Git tags, provenance/smoke results and every additional promotion commit.\n`,
      { flag: 'a' }
    );
  }
}

assert.ok(
  ['preflight', 'verify', 'complete'].includes(process.argv[2]),
  'Use preflight, verify or complete'
);
if (process.argv[2] === 'preflight') await preflight();
else if (process.argv[2] === 'verify') await verify();
else complete();
