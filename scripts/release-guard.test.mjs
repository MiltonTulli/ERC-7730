import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'erc7730-release-guard-'));
  for (const path of ['scripts', 'bin', '.changeset', 'packages/sdk', 'packages/cli']) {
    mkdirSync(join(dir, path), { recursive: true });
  }
  for (const file of ['release-guard.mjs', 'release-policy.mjs']) {
    copyFileSync(new URL(file, import.meta.url), join(dir, 'scripts', file));
  }
  const commit = 'a'.repeat(40);
  const data = {
    sdk: {
      versions: ['0.12.0'],
      'dist-tags': { latest: '0.12.0' },
      time: { '0.12.0': new Date().toISOString() },
    },
    cli: { versions: ['0.4.1'], 'dist-tags': { latest: '0.4.1' }, time: {} },
  };
  const save = () => writeFileSync(join(dir, 'metadata.json'), JSON.stringify(data));
  const manifest = (pkg, version) =>
    writeFileSync(
      join(dir, 'packages', pkg, 'package.json'),
      JSON.stringify({ name: `@erc7730/${pkg}`, version })
    );
  manifest('sdk', '1.0.0-next.0');
  manifest('cli', '0.4.1');
  writeFileSync(join(dir, '.changeset/pre.json'), '{"mode":"pre","tag":"next"}');
  const fake = (name, code) => {
    const path = join(dir, 'bin', name);
    writeFileSync(path, `#!${process.execPath}\n${code}`);
    chmodSync(path, 0o755);
  };
  fake(
    'npm',
    `const fs = require('node:fs');
    if (process.argv[2] === 'view') {
      const pkg = process.argv[3].split('/')[1];
      console.log(JSON.stringify(JSON.parse(fs.readFileSync('metadata.json'))[pkg]));
    } else if (process.argv[2] === 'pack') console.log('packed.tgz');
    else process.exit(5);`
  );
  fake(
    'gh',
    `console.log(JSON.stringify(process.argv[3] === 'list' ? [{tagName:'cli-v0.4.1'}] : {isPrerelease:true}));`
  );
  fake(
    'git',
    `if (process.argv[2] === 'rev-parse') console.log('${commit}');
    if (process.argv[2] === 'log') console.log('${'b'.repeat(40)} Reviewed additional change');`
  );
  writeFileSync(join(dir, 'scripts/resolve-publication-commit.sh'), `printf '%s\\n' '${commit}'\n`);
  writeFileSync(
    join(dir, 'scripts/sdk-consumer-install.mjs'),
    `import {writeFileSync} from 'node:fs'; writeFileSync('smoke.txt', process.env.SDK_PACKAGE);`
  );
  const run = (mode = 'preflight', branch = 'next') => {
    save();
    return spawnSync(process.execPath, ['scripts/release-guard.mjs', mode], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        GITHUB_REF_NAME: branch,
        GITHUB_SHA: commit,
        GITHUB_OUTPUT: join(dir, 'outputs'),
        GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      },
    });
  };
  return { dir, data, run, manifest };
}

test('next snapshots tags and verifies published smoke/provenance before release', () => {
  const { dir, data, run } = fixture();
  try {
    const before = run();
    assert.equal(before.status, 0, before.stderr);
    assert.match(readFileSync(join(dir, 'outputs'), 'utf8'), /channel=next/);
    data.sdk.versions.push('1.0.0-next.0');
    data.sdk['dist-tags'].next = '1.0.0-next.0';
    const after = run('verify');
    assert.equal(after.status, 0, after.stderr);
    const evidence = JSON.parse(readFileSync(join(dir, '.release-evidence/verified.json')));
    assert.equal(evidence.packages.sdk.smoke, 'passed');
    assert.equal(evidence.packages.sdk.provenance, 'verified');
    assert.equal(evidence.packages.cli.needsVerification, false);
    assert.equal(readFileSync(join(dir, 'smoke.txt'), 'utf8'), '@erc7730/sdk@1.0.0-next.0');
    const completed = run('complete');
    assert.equal(completed.status, 0, completed.stderr);
    const released = JSON.parse(readFileSync(join(dir, '.release-evidence/released.json')));
    assert.equal(released.packages.sdk.gitTag.tag, 'sdk-v1.0.0-next.0');
    assert.equal(released.packages.sdk.gitTag.commit, released.packages.sdk.publicationCommit);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an npm success followed by a failed release still reruns consumer verification', () => {
  const { dir, data, run } = fixture();
  try {
    data.sdk.versions.push('1.0.0-next.0');
    data.sdk['dist-tags'].next = '1.0.0-next.0';
    assert.equal(run().status, 0);
    const after = run('verify');
    assert.equal(after.status, 0, after.stderr);
    assert.equal(readFileSync(join(dir, 'smoke.txt'), 'utf8'), '@erc7730/sdk@1.0.0-next.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a prerelease run fails verification if latest moved', () => {
  const { dir, data, run } = fixture();
  try {
    assert.equal(run().status, 0);
    data.sdk.versions.push('1.0.0-next.0');
    data.sdk['dist-tags'].latest = '1.0.0-next.0';
    const result = run('verify');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Prerelease changed latest/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preflight blocks wrong branches, unpublished stable on next, and early stable promotion', () => {
  const { dir, run, manifest } = fixture();
  try {
    assert.notEqual(run('preflight', 'main').status, 0);
    assert.notEqual(run('preflight', 'feature').status, 0);
    manifest('sdk', '1.0.0');
    assert.match(run().stderr, /next cannot publish a new stable version/);
    rmSync(join(dir, '.changeset/pre.json'));
    assert.match(run('preflight', 'main').stderr, /Weekly cadence/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a conflicting Git tag prevents completed publication evidence', () => {
  const { dir, data, run } = fixture();
  try {
    assert.equal(run().status, 0);
    data.sdk.versions.push('1.0.0-next.0');
    data.sdk['dist-tags'].next = '1.0.0-next.0';
    assert.equal(run('verify').status, 0);
    writeFileSync(join(dir, 'bin/git'), `#!${process.execPath}\nconsole.log('${'b'.repeat(40)}');`);
    const completed = run('complete');
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /Git tag must match verified npm provenance/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stable promotion reinstalls the exact candidate and records every extra commit', () => {
  const { dir, data, run, manifest } = fixture();
  try {
    rmSync(join(dir, '.changeset/pre.json'));
    manifest('sdk', '1.0.0');
    data.sdk.time['0.12.0'] = new Date(Date.now() - 8 * 86400000).toISOString();
    mkdirSync(join(dir, '.github'));
    writeFileSync(
      join(dir, '.github/release-promotion.json'),
      JSON.stringify({
        '@erc7730/sdk': {
          candidate: '1.0.0-next.0',
          commit: 'a'.repeat(40),
          notes: 'Wallet migration and additional change reviewed.',
        },
      })
    );
    const result = run('preflight', 'main');
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(readFileSync(join(dir, '.release-evidence/before.json')));
    assert.deepEqual(evidence.packages.sdk.promotion.additionalCommits, [
      `${'b'.repeat(40)} Reviewed additional change`,
    ]);
    assert.equal(readFileSync(join(dir, 'smoke.txt'), 'utf8'), '@erc7730/sdk@1.0.0-next.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
