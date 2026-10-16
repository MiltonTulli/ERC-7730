import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sdkDir = join(root, 'packages/sdk');
const stage = mkdtempSync(join(tmpdir(), 'erc7730-sdk-consumer-'));

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function pack(dir, spec) {
  const packedOut = execFileSync(
    'npm',
    ['pack', ...(spec ? [spec] : []), '--pack-destination', stage],
    {
      cwd: dir,
      encoding: 'utf8',
    }
  );
  const tarballLine = packedOut
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.tgz'))
    .at(-1);
  if (!tarballLine) {
    fail(`npm pack in ${dir} did not print a tarball path:\n${packedOut}`);
  }
  return tarballLine.startsWith('/') ? tarballLine : join(stage, tarballLine);
}

function install(app, ...packages) {
  execFileSync('npm', ['install', '--no-fund', '--no-audit', '--ignore-scripts', ...packages], {
    cwd: app,
    stdio: 'inherit',
  });
}

function importEntries(app, entries) {
  const code = `
    import assert from 'node:assert/strict';
    // Imports must not make a network request.
    globalThis.fetch = () => { throw new Error('Network request during import'); };
    for (const entry of ${JSON.stringify(entries)}) {
      const exports = await import(entry);
      assert.ok(Object.keys(exports).length > 0, entry + ' has no runtime exports');
      console.log('Imported ' + entry + ' on ' + process.version);
    }
    const { decodeTransaction } = await import('@erc7730/sdk');
    const result = await decodeTransaction({
      to: '0xdAC17F958D2ee523a2206206994597C13D831ec7', chainId: 1,
      data: '0xa9059cbb' + '1'.padStart(64, '0') + '1'.padStart(64, '0'),
    });
    assert.equal(result.intent, 'Send tokens');
    assert.equal(result.source, 'builtin');
    assert.equal(result.trust.accepted, false);
    console.log('Decoded transfer with the default trust policy');
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: app,
    stdio: 'inherit',
  });
}

function typecheckEntries(app, entries) {
  const imports = entries.map((entry, i) => `import * as entry${i} from '${entry}';`);
  writeFileSync(
    join(app, 'consumer.mts'),
    `${imports.join('\n')}\nexport const entries = [${entries.map((_, i) => `entry${i}`).join(', ')}];\n`
  );
  for (const [module, moduleResolution] of [
    ['NodeNext', 'NodeNext'],
    ['ESNext', 'Bundler'],
  ]) {
    writeFileSync(
      join(app, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM'],
          module,
          moduleResolution,
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        files: ['consumer.mts'],
      })
    );
    execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], {
      cwd: app,
      stdio: 'inherit',
    });
    console.log(
      `Typechecked ${entries.length} entries with ${moduleResolution} on ${process.version}`
    );
  }
}

try {
  if (!process.env.SDK_PACKAGE && !existsSync(join(sdkDir, 'dist/index.js'))) {
    fail('Build @erc7730/sdk before the consumer install check.');
  }

  const tarball = pack(process.env.SDK_PACKAGE ? stage : sdkDir, process.env.SDK_PACKAGE);
  const app = join(stage, 'app');
  mkdirSync(app);
  writeFileSync(
    join(app, 'package.json'),
    `${JSON.stringify({ name: 'erc7730-sdk-consumer', private: true, type: 'module' }, null, 2)}\n`
  );
  install(app, tarball);

  const installed = readJson(join(app, 'node_modules/@erc7730/sdk/package.json'));
  assert.equal(installed.dependencies?.viem, undefined, 'viem must not be a runtime dependency');
  assert.equal(installed.peerDependencies?.viem, '^2.21.0');
  assert.equal(installed.peerDependenciesMeta?.viem?.optional, true);
  assert.ok(installed.dependencies?.ox && installed.dependencies?.['@noble/hashes']);
  assert.equal(existsSync(join(app, 'node_modules/viem')), false, 'Base install pulled viem');
  assert.equal(installed.type, 'module');
  if (process.env.SDK_PACKAGE) {
    assert.equal(`${installed.name}@${installed.version}`, process.env.SDK_PACKAGE);
  }

  // Derive coverage from the tarball so a new public subpath is tested automatically.
  const entries = Object.entries(installed.exports).map(([subpath, conditions]) => {
    assert.ok(conditions.types && conditions.import, `${subpath} needs ESM and type exports`);
    assert.equal(conditions.require, undefined, `${subpath} must remain ESM-only`);
    return subpath === '.' ? installed.name : installed.name + subpath.slice(1);
  });
  const attest = `${installed.name}/attest`;
  assert.ok(entries.includes(attest));
  const withoutPeer = entries.filter((entry) => entry !== attest);
  importEntries(app, withoutPeer);
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict';
       await assert.rejects(import('${attest}'), (error) =>
         error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes("package 'viem'"));`,
    ],
    { cwd: app, stdio: 'inherit' }
  );

  // Install the same compiler/type versions as the checkout, in the isolated app.
  const typescript = readJson(join(root, 'node_modules/typescript/package.json')).version;
  const nodeTypes = readJson(join(sdkDir, 'node_modules/@types/node/package.json')).version;
  install(app, `typescript@${typescript}`, `@types/node@${nodeTypes}`);
  assert.equal(existsSync(join(app, 'node_modules/viem')), false, 'Type tooling pulled viem');
  typecheckEntries(app, withoutPeer);

  install(app, `viem@${installed.peerDependencies.viem}`);
  const viem = readJson(join(app, 'node_modules/viem/package.json')).version;
  console.log(`Optional peer installed: viem@${viem}; TypeScript ${typescript}`);
  importEntries(app, entries);
  typecheckEntries(app, entries);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

console.log(`SDK consumer install passed on ${process.version}`);
