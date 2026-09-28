import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');

const patterns = [
  /placeholder until TrustPolicy/i,
  /untrusted until TrustPolicy/i,
  /attestation verification is not implemented/i,
  /once attestation verification exists/i,
  /Publicado:\s*`@erc7730\/sdk@0\.4\.0`/,
  /@erc7730\/sdk@0\.4\.0`, `@erc7730\/cli@0\.2\.0/,
];

const roots = [
  'README.md',
  'ROADMAP.md',
  'docs',
  'packages/sdk/README.md',
  'packages/cli/README.md',
  'packages/web',
  'packages/docs/src/content/docs',
];

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'api') {
        continue;
      }
      out.push(...(await walk(path)));
    } else if (/\.(md|mdx|html|ts|js|mjs)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/** @type {string[]} */
const files = [];
for (const root of roots) {
  const abs = join(repoRoot, root);
  if (root.endsWith('.md')) {
    files.push(abs);
  } else {
    files.push(...(await walk(abs)));
  }
}

let failed = false;
for (const file of files) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      console.error(`stale phrase ${pattern} in ${relative(repoRoot, file)}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log('stale-phrase check ok');
