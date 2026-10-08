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

const required = ['index.js', 'index.d.ts', 'attest.js', 'attest.d.ts'];
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

if (!index.includes('fetchFromSourcify') && !index.includes('sourcify.dev')) {
  fail('dist/index.js no longer includes the Sourcify client');
}
if (index.includes('enableSourcifyAbiLoader')) {
  fail('dist/index.js still exports enableSourcifyAbiLoader');
}
if (index.includes('setDefaultVerifiedAbiLoader') || index.includes('customSignatures')) {
  fail('dist/index.js still has a process-global Sourcify loader or signature map');
}
if (!/from\s*['"]ajv\/dist\/2020\.js['"]/.test(index)) {
  fail('SDK bundle does not keep ajv/dist/2020.js external');
}
if (/from\s*['"]viem(?:\/[^'"]*)?['"]/.test(index)) {
  fail('dist/index.js still imports viem');
}
const attestFile = join(dist, 'attest.js');
const attest = readFileSync(attestFile, 'utf8');
if (!/from\s*['"]viem(?:\/[^'"]*)?['"]/.test(attest)) {
  fail('dist/attest.js should keep viem external');
}
const indexDts = readFileSync(join(dist, 'index.d.ts'), 'utf8');
if (/\bviem\b/.test(indexDts)) {
  fail('dist/index.d.ts still names viem');
}
for (const name of ['lite.js', 'viem.js', 'lite.d.ts', 'viem.d.ts']) {
  try {
    if (statSync(join(dist, name)).isFile()) {
      fail(`SDK dist still publishes ${name}`);
    }
  } catch {
    // Missing is the expected result.
  }
}

// The published SDK does not ship the historical descriptor catalog.
const catalogTokens = ['EMBEDDED_REGISTRY', '0x8236a87084f8b84306f72007f36f2618a5634494'];
for (const { file, code } of indexGraph) {
  for (const token of catalogTokens) {
    if (code.includes(token)) {
      fail(`${file} includes ${token}, which must stay out of the published SDK`);
    }
  }
}

console.log('SDK bundle graph check passed');
