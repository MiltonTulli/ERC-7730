import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cliDir = join(root, 'packages/cli');
const validDescriptor = join(
  root,
  'packages/sdk/src/__tests__/fixtures/official/weth-calldata-weth.json'
);
const invalidDescriptor = join(root, 'packages/cli/src/__tests__/fixtures/invalid-extra.json');

const entry = join(cliDir, 'dist/index.js');
const built = readFileSync(entry, 'utf8');
if (!built.startsWith('#!')) {
  throw new Error(`${entry} is missing a shebang. Build @erc7730/cli before packing.`);
}

const stage = mkdtempSync(join(tmpdir(), 'erc7730-cli-pack-'));

function fail(message) {
  throw new Error(message);
}

try {
  const packedOut = execFileSync('pnpm', ['pack', '--pack-destination', stage], {
    cwd: cliDir,
    encoding: 'utf8',
  });
  const tarballLine = packedOut
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.tgz'))
    .at(-1);
  if (!tarballLine) {
    fail(`pnpm pack did not print a tarball path:\n${packedOut}`);
  }
  const tarball = tarballLine.startsWith('/') ? tarballLine : join(stage, tarballLine);

  const names = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');
  const leaked = names.filter((name) =>
    /(?:^|\/)src\/|__tests__|\.test\.|(?:^|\/)test\/|\.map$/.test(name)
  );
  if (leaked.length > 0) {
    fail(`CLI tarball contains unpublished files:\n${leaked.join('\n')}`);
  }
  if (!names.some((name) => name.endsWith('/dist/index.js'))) {
    fail('CLI tarball is missing dist/index.js');
  }

  const app = join(stage, 'app');
  execFileSync('mkdir', ['-p', app]);
  execFileSync('npm', ['install', '--no-fund', '--no-audit', '--ignore-scripts', tarball], {
    cwd: app,
    stdio: 'inherit',
  });

  const installedPkgPath = join(app, 'node_modules/@erc7730/cli/package.json');
  const installed = JSON.parse(readFileSync(installedPkgPath, 'utf8'));
  const sdkDep = installed.dependencies?.['@erc7730/sdk'];
  if (typeof sdkDep !== 'string' || sdkDep.includes('workspace:')) {
    fail(`Packed CLI dependency on @erc7730/sdk is ${String(sdkDep)}`);
  }
  if (installed.main || installed.types || installed.exports) {
    fail('Packed CLI still publishes main, types, or exports');
  }
  if (installed.bin?.erc7730 == null) {
    fail('Packed CLI is missing the erc7730 bin');
  }

  const installedEntry = join(app, 'node_modules/@erc7730/cli/dist/index.js');
  const installedSource = readFileSync(installedEntry, 'utf8');
  if (!installedSource.startsWith('#!')) {
    fail('Installed dist/index.js is missing a shebang');
  }
  if ((statSync(installedEntry).mode & 0o111) === 0) {
    fail('Installed dist/index.js is not executable');
  }

  const bin = join(app, 'node_modules/.bin/erc7730');
  const help = execFileSync(bin, ['--help'], { encoding: 'utf8' });
  if (!help.includes('generate') || !help.includes('lint') || !help.includes('registry')) {
    fail(`erc7730 --help did not list commands:\n${help}`);
  }

  execFileSync(bin, ['lint', validDescriptor], { stdio: 'inherit' });

  let invalidStatus = 0;
  let invalidStdout = '';
  try {
    invalidStdout = execFileSync(bin, ['lint', invalidDescriptor], { encoding: 'utf8' });
  } catch (error) {
    invalidStatus = typeof error.status === 'number' ? error.status : 1;
    invalidStdout = String(error.stdout ?? '');
    if (invalidStatus !== 1) {
      throw error;
    }
  }
  if (invalidStatus !== 1 || !invalidStdout.includes('error')) {
    fail(
      `lint of an invalid descriptor should exit 1 with an error report, got ${invalidStatus}:\n${invalidStdout}`
    );
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

console.log('CLI pack smoke passed');
