import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const descriptorsDir = join(root, 'packages/registry/descriptors');
const cli = join(root, 'packages/cli/dist/index.js');

/**
 * @param {string} dir
 * @param {string[]} out
 */
async function collectTests(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === 'testsv2') {
      const names = await readdir(path);
      for (const name of names) {
        if (name.endsWith('.tests.json')) {
          out.push(join(path, name));
        }
      }
      continue;
    }
    await collectTests(path, out);
  }
  return out;
}

if (!existsSync(cli)) {
  console.error(`${cli} is missing. Build @erc7730/cli before running descriptor tests.`);
  process.exit(1);
}

const files = (await collectTests(descriptorsDir, [])).sort();
if (files.length === 0) {
  console.error('no testsv2 files under packages/registry/descriptors');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const document = JSON.parse(await readFile(file, 'utf8'));
  if (typeof document.descriptor !== 'string' || document.descriptor.length === 0) {
    console.error(`${file}: missing descriptor`);
    failed += 1;
    continue;
  }
  const descriptor = resolve(dirname(file), document.descriptor);
  console.log(`\n# ${file}`);
  const result = spawnSync(
    process.execPath,
    [cli, 'test', descriptor, '--tests', file, '--reporter', 'github'],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} descriptor test file(s) failed`);
  process.exit(1);
}
