import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sdkDir = join(root, 'packages/sdk');
const stage = mkdtempSync(join(tmpdir(), 'erc7730-sdk-consumer-'));

function fail(message) {
  throw new Error(message);
}

function pack(dir) {
  const packedOut = execFileSync('npm', ['pack', '--pack-destination', stage], {
    cwd: dir,
    encoding: 'utf8',
  });
  const tarballLine = packedOut
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.tgz'))
    .at(-1);
  if (!tarballLine) {
    fail(`pnpm pack in ${dir} did not print a tarball path:\n${packedOut}`);
  }
  return tarballLine.startsWith('/') ? tarballLine : join(stage, tarballLine);
}

try {
  if (!existsSync(join(sdkDir, 'dist/index.js'))) {
    fail('Build @erc7730/sdk before the consumer install check.');
  }

  const tarball = pack(sdkDir);
  const app = join(stage, 'app');
  execFileSync('mkdir', ['-p', app]);
  writeFileSync(
    join(app, 'package.json'),
    `${JSON.stringify({ name: 'erc7730-sdk-consumer', private: true, type: 'module' }, null, 2)}\n`
  );
  execFileSync('npm', ['install', '--no-fund', '--no-audit', '--ignore-scripts', tarball], {
    cwd: app,
    stdio: 'inherit',
  });

  const installed = JSON.parse(
    readFileSync(join(app, 'node_modules/@erc7730/sdk/package.json'), 'utf8')
  );
  if (installed.dependencies?.viem != null) {
    fail(`Packed SDK still depends on viem: ${String(installed.dependencies?.viem)}`);
  }
  if (installed.peerDependencies?.viem != null || installed.peerDependenciesMeta?.viem != null) {
    fail('Packed SDK still declares viem as a peer');
  }
  if (!installed.dependencies?.ox || !installed.dependencies?.['@noble/hashes']) {
    fail(`Packed SDK is missing ox or @noble/hashes: ${JSON.stringify(installed.dependencies)}`);
  }

  execFileSync(
    process.execPath,
    ['--input-type=module', '-e', ["await import('@erc7730/sdk');"].join('\n')],
    { cwd: app, stdio: 'inherit' }
  );

  let listed = '';
  try {
    listed = execFileSync('npm', ['ls', 'viem', '--all'], { cwd: app, encoding: 'utf8' });
  } catch (error) {
    listed = String(error.stdout ?? error.message ?? '');
  }
  if (/viem@/.test(listed)) {
    fail(`Root install pulled viem:\n${listed}`);
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

console.log('SDK consumer install passed');
