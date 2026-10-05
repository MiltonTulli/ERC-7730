import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'packages/sdk/dist');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function listMaps(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listMaps(full));
    } else if (entry.name.endsWith('.map')) {
      found.push(full);
    }
  }
  return found;
}

function relativeChunks(file, seen = new Set()) {
  const abs = resolve(file);
  if (seen.has(abs)) {
    return [];
  }
  seen.add(abs);
  const code = readFileSync(abs, 'utf8');
  const files = [{ file: abs, code }];
  for (const match of code.matchAll(/['"](\.[^'"]+\.js)['"]/g)) {
    const next = resolve(dirname(abs), match[1]);
    files.push(...relativeChunks(next, seen));
  }
  return files;
}

const required = ['index.js', 'lite.js', 'viem.js', 'index.d.ts', 'lite.d.ts', 'viem.d.ts'];
for (const name of required) {
  const file = join(dist, name);
  try {
    if (!statSync(file).isFile()) {
      fail(`Missing SDK bundle file: ${file}`);
    }
  } catch {
    fail(`Missing SDK bundle file: ${file}`);
  }
}

const maps = listMaps(dist);
if (maps.length > 0) {
  fail(`SDK dist still contains sourcemaps:\n${maps.join('\n')}`);
}

const indexFile = join(dist, 'index.js');
const indexGraph = relativeChunks(indexFile);
const index = indexGraph.map((entry) => entry.code).join('\n');
const liteFile = join(dist, 'lite.js');

if (!index.includes('fetchFromSourcify') && !index.includes('sourcify.dev')) {
  fail('dist/index.js no longer includes the Sourcify client');
}
if (!index.includes('enableSourcifyAbiLoader')) {
  fail('dist/index.js no longer exports enableSourcifyAbiLoader');
}
if (!/from\s*['"]ajv\/dist\/2020\.js['"]/.test(index)) {
  fail('SDK bundle does not keep ajv/dist/2020.js external');
}
if (statSync(liteFile).size >= statSync(join(dist, 'index.js')).size) {
  fail(
    'dist/lite.js is not smaller than dist/index.js; Sourcify and generateDescriptor should stay off the lite graph'
  );
}

// The published SDK does not ship the historical descriptor catalog.
const catalogTokens = ['EMBEDDED_REGISTRY', '0x8236a87084f8b84306f72007f36f2618a5634494'];
for (const entry of [indexFile, liteFile, join(dist, 'viem.js')]) {
  for (const { file, code } of relativeChunks(entry)) {
    for (const token of catalogTokens) {
      if (code.includes(token)) {
        fail(`${file} includes ${token}, which must stay out of the published SDK`);
      }
    }
  }
}

// Lite keeps the official-registry client. Sourcify stays on the root entry.
const banned = [
  'sourcify.dev',
  'fetchFromSourcify',
  'enableSourcifyAbiLoader',
  'sourcifyVerifiedAbiLoader',
  'node:fs',
  'node:path',
];
for (const { file, code } of relativeChunks(liteFile)) {
  for (const token of banned) {
    if (code.includes(token)) {
      fail(`${file} includes ${token}, which must stay out of the lite graph`);
    }
  }
}

if (!readFileSync(join(dist, 'lite.d.ts'), 'utf8').includes('createOfficialRegistry')) {
  fail('dist/lite no longer exports createOfficialRegistry');
}

console.log('SDK bundle graph check passed');
