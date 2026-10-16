import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url).pathname;
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'erc7730-independent-'));
  for (const path of ['scripts', '.changeset', 'packages/sdk', 'packages/cli'])
    mkdirSync(join(dir, path), { recursive: true });
  for (const file of ['version-packages.mjs', 'release-policy.mjs'])
    copyFileSync(join(root, 'scripts', file), join(dir, 'scripts', file));
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ private: true, packageManager: 'pnpm@10.28.0' })
  );
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeFileSync(
    join(dir, '.changeset/config.json'),
    JSON.stringify({
      changelog: '@changesets/cli/changelog',
      commit: false,
      fixed: [],
      linked: [],
      access: 'public',
      baseBranch: 'main',
      ignore: [],
    })
  );
  writeFileSync(join(dir, '.changeset/README.md'), 'Changesets\n');
  writeFileSync(
    join(dir, 'packages/sdk/package.json'),
    JSON.stringify({ name: '@erc7730/sdk', version: '0.12.0' })
  );
  writeFileSync(
    join(dir, 'packages/cli/package.json'),
    JSON.stringify({
      name: '@erc7730/cli',
      version: '0.4.1',
      dependencies: { '@erc7730/sdk': 'workspace:*' },
    })
  );
  const run = (cmd, args, branch = 'main') =>
    execFileSync(cmd, args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        GITHUB_REF_NAME: branch,
        GIT_AUTHOR_NAME: 'Release test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Release test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
      stdio: 'pipe',
    });
  run('git', ['init', '-b', 'main']);
  run('git', ['add', '.changeset', 'package.json', 'pnpm-workspace.yaml', 'packages', 'scripts']);
  run('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture', '--no-verify']);
  const changeset = (id, releases) =>
    writeFileSync(
      join(dir, '.changeset', `${id}.md`),
      `---\n${releases}\n---\n\nWhat this means for your wallet: tested release.\n`
    );
  const version = (branch) => run(process.execPath, ['scripts/version-packages.mjs'], branch);
  return { dir, run, changeset, version };
}

test('SDK-only candidates advance and exit pre mode without releasing CLI', () => {
  const { dir, run, changeset, version } = fixture();
  try {
    run('git', ['checkout', '-b', 'next']);
    run('git', ['branch', '-D', 'main']); // Actions' next checkout has no local main.
    const cliBefore = readFileSync(join(dir, 'packages/cli/package.json'), 'utf8');
    changeset('major-sdk', '"@erc7730/sdk": major');
    version('next');
    assert.equal(read(join(dir, 'packages/sdk/package.json')).version, '1.0.0-next.0');
    assert.equal(read(join(dir, 'packages/cli/package.json')).version, '0.4.1');
    assert.equal(existsSync(join(dir, 'packages/cli/CHANGELOG.md')), false);
    assert.equal(read(join(dir, '.changeset/pre.json')).tag, 'next');
    assert.ok(existsSync(join(dir, '.changeset/pre/major-sdk.md')));
    changeset('fix-sdk', '"@erc7730/sdk": patch');
    version('next');
    assert.equal(read(join(dir, 'packages/sdk/package.json')).version, '1.0.0-next.1');
    run('pnpm', ['changeset', 'pre', 'exit']);
    version('main');
    assert.equal(read(join(dir, 'packages/sdk/package.json')).version, '1.0.0');
    assert.deepEqual(read(join(dir, 'packages/cli/package.json')), JSON.parse(cliBefore));
    assert.equal(existsSync(join(dir, '.changeset/pre.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a CLI-only stable patch leaves SDK untouched', () => {
  const { dir, changeset, version } = fixture();
  try {
    changeset('cli-fix', '"@erc7730/cli": patch');
    version('main');
    assert.equal(read(join(dir, 'packages/cli/package.json')).version, '0.4.2');
    assert.equal(read(join(dir, 'packages/sdk/package.json')).version, '0.12.0');
    assert.equal(existsSync(join(dir, 'packages/sdk/CHANGELOG.md')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
