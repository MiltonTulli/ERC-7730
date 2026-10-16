import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
import test from 'node:test';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'erc7730-release-guard-'));
  for (const path of ['scripts', 'bin', '.changeset', 'packages/sdk', 'packages/cli']) {
    mkdirSync(join(dir, path), { recursive: true });
  }
  for (const file of ['release-guard.mjs', 'release-policy.mjs', 'release-registry.mjs']) {
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
  const responses = {};
  const respond = (query, ...values) => {
    responses[query] = values;
    writeFileSync(join(dir, 'responses.json'), JSON.stringify(responses));
  };
  fake(
    'npm',
    `const fs = require('node:fs');
    const path = require('node:path');
    const root = ${JSON.stringify(dir)};
    const args = process.argv.slice(2);
    fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
    const data = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json')));
    const query = args.slice(0, 3).join(' ');
    const responsesFile = path.join(root, 'responses.json');
    const responses = fs.existsSync(responsesFile) ? JSON.parse(fs.readFileSync(responsesFile)) : {};
    if (responses[query]) {
      const list = responses[query];
      const result = list.length > 1 ? list.shift() : list[0];
      fs.writeFileSync(responsesFile, JSON.stringify(responses));
      if (result !== null) {
        console.log(typeof result === 'string' ? result : JSON.stringify(result));
        process.exit(result.error ? 1 : 0);
      }
    }
    if (args[0] === 'view') {
      const [pkg, version] = args[1].split('/')[1].split('@');
      if (args[2] === 'version') {
        if ((data[pkg].exactVersions ?? data[pkg].versions).includes(version)) {
          console.log(JSON.stringify(version));
        } else {
          console.log(JSON.stringify({error:{code:'E404', summary:'No match found for version ' + version}}));
          process.exit(1);
        }
      } else if (args[2] === 'dist.attestations.url') {
        console.log(JSON.stringify('https://registry.npmjs.org/attestation'));
      } else {
        console.log(JSON.stringify(data[pkg]));
      }
    } else if (args[0] === 'pack') {
      const [pkg, version] = args[1].split('/')[1].split('@');
      fs.writeFileSync(path.join(args[3], 'erc7730-' + pkg + '-' + version + '.tgz'), 'published tarball');
    } else if (args[0] === 'install') {
      const version = args.at(-1).split('@').at(-1);
      fs.mkdirSync('node_modules/.bin', {recursive:true});
      fs.writeFileSync('node_modules/.bin/erc7730', '#!${process.execPath}\\nconsole.log(process.argv[2] === "--version" ? "' + version + '" : "generate");', {mode:0o755});
    } else process.exit(5);`
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
  const run = (mode = 'preflight', branch = 'next', sha = commit) => {
    save();
    return spawnSync(process.execPath, ['scripts/release-guard.mjs', mode], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
        GITHUB_REF_NAME: branch,
        GITHUB_SHA: sha,
        RELEASE_REGISTRY_RETRY_DELAY_MS: '0',
        GITHUB_OUTPUT: join(dir, 'outputs'),
        GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      },
    });
  };
  const calls = () =>
    readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  return { dir, data, run, manifest, respond, calls };
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

test('recovers both published candidates with stale version lists and no GitHub Releases', () => {
  const { dir, data, run, manifest, calls } = fixture();
  try {
    manifest('cli', '0.5.0-next.0');
    data.sdk.exactVersions = ['1.0.0-next.0'];
    data.cli.exactVersions = ['0.5.0-next.0'];
    data.sdk['dist-tags'].next = '1.0.0-next.0';
    data.cli['dist-tags'].next = '0.5.0-next.0';
    // Recovery runs on a newer fix commit, but must tag the original publication.
    const recoveryCommit = 'b'.repeat(40);
    const before = run('preflight', 'next', recoveryCommit);
    assert.equal(before.status, 0, before.stderr);
    const outputs = readFileSync(join(dir, 'outputs'), 'utf8');
    for (const pkg of ['sdk', 'cli']) {
      assert.match(outputs, new RegExp(`${pkg}_publish=false`));
      assert.match(outputs, new RegExp(`${pkg}_release=true`));
    }
    const after = run('verify', 'next', recoveryCommit);
    assert.equal(after.status, 0, after.stderr);
    const verified = JSON.parse(readFileSync(join(dir, '.release-evidence/verified.json')));
    for (const [pkg, entry] of Object.entries(verified.packages)) {
      assert.equal(entry.smoke, 'passed');
      assert.equal(entry.provenance, 'verified');
      assert.equal(entry.publicationCommit, 'a'.repeat(40));
      assert.equal(entry.before['dist-tags'].latest, entry.after['dist-tags'].latest);
      assert.equal(
        readFileSync(join(dir, 'packages', pkg, `erc7730-${pkg}-${entry.version}.tgz`), 'utf8'),
        'published tarball'
      );
    }
    assert.equal(readFileSync(join(dir, 'smoke.txt'), 'utf8'), '@erc7730/sdk@1.0.0-next.0');
    assert.ok(
      calls().some((args) => args[0] === 'install' && args.at(-1) === '@erc7730/cli@0.5.0-next.0')
    );
    assert.ok(calls().every((args) => args[0] !== 'publish'));
    const completed = run('complete', 'next', recoveryCommit);
    assert.equal(completed.status, 0, completed.stderr);
    const released = JSON.parse(readFileSync(join(dir, '.release-evidence/released.json')));
    for (const [pkg, entry] of Object.entries(released.packages)) {
      assert.deepEqual(entry.gitTag, {
        tag: `${pkg}-v${entry.version}`,
        commit: 'a'.repeat(40),
        prerelease: true,
      });
      assert.match(
        readFileSync(join(dir, 'outputs'), 'utf8'),
        new RegExp(`${pkg}_commit=${'a'.repeat(40)}`)
      );
    }
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

const missingVersion = {
  error: { code: 'E404', summary: 'No match found for version 1.0.0-next.0' },
};
const sdkQuery = 'view @erc7730/sdk@1.0.0-next.0 version';

test('preflight waits for an existing candidate to propagate before deciding to publish', () => {
  const { dir, data, run, respond, calls } = fixture();
  try {
    data.sdk.versions.push('1.0.0-next.0');
    respond(sdkQuery, missingVersion, missingVersion, null);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(dir, 'outputs'), 'utf8'), /sdk_publish=false/);
    assert.equal(calls().filter((args) => args.slice(0, 3).join(' ') === sdkQuery).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('only a confirmed absent version enables publishing after bounded retries', () => {
  const { dir, run, calls } = fixture();
  try {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(dir, 'outputs'), 'utf8'), /sdk_publish=true/);
    assert.equal(calls().filter((args) => args.slice(0, 3).join(' ') === sdkQuery).length, 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const response of [
  { error: { code: 'E401', summary: 'Authentication required' } },
  { error: { code: 'E403', summary: 'Forbidden' } },
  { error: { code: 'E404', summary: 'Package not found or inaccessible' } },
  { error: { code: 'EAI_AGAIN', summary: 'DNS unavailable' } },
  { error: { code: 'ETIMEDOUT', summary: 'Network timeout' } },
  { error: { code: 'E500', summary: 'Registry unavailable' } },
  'invalid json',
  '',
  '"0.12.0"',
]) {
  test(`registry failure blocks publication: ${JSON.stringify(response)}`, () => {
    const { dir, run, respond, calls } = fixture();
    try {
      respond(sdkQuery, response);
      const result = run();
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(join(dir, 'outputs')), false);
      assert.equal(calls().filter((args) => args.slice(0, 3).join(' ') === sdkQuery).length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('verification waits for exact version, dist-tag and attestation propagation', () => {
  const { dir, data, run, respond, calls } = fixture();
  try {
    assert.equal(run().status, 0);
    data.sdk.versions.push('1.0.0-next.0');
    const stale = structuredClone(data.sdk);
    data.sdk['dist-tags'].next = '1.0.0-next.0';
    respond(sdkQuery, missingVersion, null);
    respond('view @erc7730/sdk dist-tags', stale, null);
    respond('view @erc7730/sdk@1.0.0-next.0 dist.attestations.url', '', null);
    const result = run('verify');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(dir, '.release-evidence/verified.json')), true);
    assert.equal(calls().filter((args) => args[2] === 'dist.attestations.url').length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verification stops after bounded propagation retries without release outputs', () => {
  const { dir, run, calls } = fixture();
  try {
    assert.equal(run().status, 0);
    const result = run('verify');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /npm publication did not propagate/);
    assert.equal(calls().filter((args) => args.slice(0, 3).join(' ') === sdkQuery).length, 20);
    assert.equal(existsSync(join(dir, '.release-evidence/verified.json')), false);
    assert.doesNotMatch(readFileSync(join(dir, 'outputs'), 'utf8'), /sdk_commit=/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('registry metadata errors fail closed', () => {
  const { dir, run, respond } = fixture();
  try {
    respond('view @erc7730/sdk dist-tags', { error: { code: 'E401', summary: 'Unauthorized' } });
    assert.notEqual(run().status, 0);
    assert.equal(existsSync(join(dir, 'outputs')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const failure of ['provenance', 'consumer']) {
  test(`failed ${failure} verification prevents release commit outputs`, () => {
    const { dir, data, run } = fixture();
    try {
      data.sdk.versions.push('1.0.0-next.0');
      assert.equal(run().status, 0);
      if (failure === 'provenance') {
        writeFileSync(join(dir, 'scripts/resolve-publication-commit.sh'), 'exit 1\n');
      } else {
        writeFileSync(join(dir, 'scripts/sdk-consumer-install.mjs'), 'process.exit(1);');
      }
      assert.notEqual(run('verify').status, 0);
      assert.equal(existsSync(join(dir, '.release-evidence/verified.json')), false);
      assert.doesNotMatch(readFileSync(join(dir, 'outputs'), 'utf8'), /sdk_commit=/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('publication resolver keeps checksum diagnostics out of its commit output', () => {
  const { dir } = fixture();
  try {
    copyFileSync(
      new URL('resolve-publication-commit.sh', import.meta.url),
      join(dir, 'scripts/resolve-publication-commit.sh')
    );
    const payload = Buffer.from(
      JSON.stringify({
        predicate: {
          buildDefinition: {
            externalParameters: {
              workflow: {
                repository: 'https://github.com/MiltonTulli/ERC-7730',
                path: '.github/workflows/release.yml',
                ref: 'refs/heads/next',
              },
            },
            resolvedDependencies: [
              {
                uri: 'git+https://github.com/MiltonTulli/ERC-7730',
                digest: { gitCommit: 'a'.repeat(40) },
              },
            ],
          },
        },
      })
    ).toString('base64');
    const attestations = {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: { dsseEnvelope: { payload } },
        },
      ],
    };
    for (const [name, code] of Object.entries({
      npm: 'console.log(JSON.stringify("https://registry.npmjs.org/attestation"));',
      uname: 'console.log("x86_64");',
      sha256sum: 'console.log("checksum OK");',
      curl: `const fs = require('node:fs');
        const args = process.argv.slice(2);
        const out = args[args.indexOf('-o') + 1];
        fs.writeFileSync(out, out.endsWith('attestations.json')
          ? ${JSON.stringify(JSON.stringify(attestations))}
          : '#!/bin/sh\\nexit 0\\n');`,
    })) {
      writeFileSync(join(dir, 'bin', name), `#!${process.execPath}\n${code}`, { mode: 0o755 });
    }
    writeFileSync(join(dir, 'published.tgz'), 'tarball');
    const result = spawnSync(
      'bash',
      ['scripts/resolve-publication-commit.sh', 'published.tgz', '@erc7730/sdk', '1.0.0-next.0'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, COSIGN_BIN: '' },
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${'a'.repeat(40)}\n`);
    assert.match(result.stderr, /checksum OK/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
