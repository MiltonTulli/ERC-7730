import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../dist');
const base = 'ERC-7730';

/** Paths relative to dist (Astro emits under the base folder for project sites). */
const required = [
  'index.html',
  'guide/index.html',
  'trust/index.html',
  'registry/index.html',
  'not-this/index.html',
  'sdk/index.html',
  'sdk/decode/index.html',
  'sdk/validate-resolve/index.html',
  'sdk/viem/index.html',
  'sdk/api/index.html',
  'cli/index.html',
  'cli/generate/index.html',
  'cli/walkthrough/index.html',
  'interop/index.html',
  'action/index.html',
  'divergences/index.html',
  'demo/index.html',
  'pagefind/pagefind.js',
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Astro may put pages at dist/<base>/... or dist/... depending on config.
 * Prefer the base subdir when present.
 */
async function resolveDistRoot() {
  const withBase = join(dist, base);
  if (await exists(join(withBase, 'index.html'))) {
    return withBase;
  }
  if (await exists(join(dist, 'index.html'))) {
    return dist;
  }
  throw new Error(`No index.html under ${dist} or ${withBase}`);
}

const root = await resolveDistRoot();
const missing = [];

for (const rel of required) {
  if (!(await exists(join(root, rel)))) {
    missing.push(rel);
  }
}

if (missing.length > 0) {
  console.error('docs smoke: missing routes:');
  for (const rel of missing) {
    console.error(`  - ${rel}`);
  }
  // Help debug layout
  try {
    console.error('dist top-level:', await readdir(dist));
  } catch {
    /* ignore */
  }
  process.exit(1);
}

const apiDir = join(root, 'sdk/api');
if (!(await exists(apiDir))) {
  console.error('docs smoke: missing sdk/api (TypeDoc output)');
  process.exit(1);
}

const apiListing = await readdir(apiDir, { recursive: true });
const apiJoined = apiListing.join('\n');
for (const symbol of ['decodeTransaction', 'decodeViemTransaction']) {
  if (!apiJoined.toLowerCase().includes(symbol.toLowerCase())) {
    // File names may be kebab or nested; also scan HTML contents
    let found = false;
    for (const file of apiListing) {
      if (!file.endsWith('.html') && !file.endsWith('.md')) continue;
      const text = await readFile(join(apiDir, file), 'utf8');
      if (text.includes(symbol)) {
        found = true;
        break;
      }
    }
    if (!found) {
      console.error(`docs smoke: generated API does not mention ${symbol}`);
      process.exit(1);
    }
  }
}

const cliRef = await readFile(join(here, '../src/content/docs/cli/generate.md'), 'utf8');
const flagLine = cliRef.match(/<!-- flags:([^>]+) -->/);
if (!flagLine) {
  console.error('docs smoke: cli generate.md missing flags marker');
  process.exit(1);
}
for (const flag of flagLine[1].split(',')) {
  if (!cliRef.includes(flag)) {
    console.error(`docs smoke: CLI reference missing ${flag}`);
    process.exit(1);
  }
}

const walkthrough = await readFile(join(here, '../src/content/docs/cli/walkthrough.md'), 'utf8');
const walkFlags = [...walkthrough.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]);
const allowed = new Set(flagLine[1].split(','));
for (const flag of walkFlags) {
  if (!allowed.has(flag)) {
    console.error(`docs smoke: walkthrough uses undocumented flag ${flag}`);
    process.exit(1);
  }
}

const home = await readFile(join(root, 'index.html'), 'utf8');
for (const needle of ['@erc7730/sdk', '@erc7730/cli', 'python-erc7730', 'Sourcify']) {
  if (!home.includes(needle)) {
    console.error(`docs smoke: home page missing “${needle}”`);
    process.exit(1);
  }
}
if (!/descriptor catalog/i.test(home)) {
  console.error('docs smoke: home page should state we are not a catalog');
  process.exit(1);
}

console.log(`docs smoke ok (${root})`);
