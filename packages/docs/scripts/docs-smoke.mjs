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
  'design-decisions/index.html',
  'support-policy/index.html',
  'sdk/index.html',
  'sdk/compatibility/index.html',
  'sdk/decode/index.html',
  'sdk/validate-resolve/index.html',
  'sdk/viem/index.html',
  'sdk/migrating-to-1-0/index.html',
  'sdk/api/index.html',
  'sdk/api/functions/clearsign/index.html',
  'sdk/api/functions/decodetransaction/index.html',
  'sdk/api/functions/decodeviemtypeddata/index.html',
  'sdk/api/functions/validatedescriptor/index.html',
  'sdk/api/functions/resolvedescriptor/index.html',
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

/**
 * Astro writes each page as `.../index.html`. That filename is not the TypeDoc
 * module segment the public URL must not contain.
 *
 * @param {string} file
 */
function functionRouteHasIndexSegment(file) {
  const rel = file.split('\\').join('/');
  if (!rel.endsWith('.html')) {
    return false;
  }
  if (!rel.includes('/functions/') && !rel.startsWith('functions/')) {
    return false;
  }
  const route = rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  return route.split('/').includes('index');
}

const apiListing = await readdir(apiDir, { recursive: true });
const indexSegmentRoutes = apiListing.filter((file) => functionRouteHasIndexSegment(String(file)));
if (indexSegmentRoutes.length > 0) {
  console.error('docs smoke: /sdk/api/functions routes contain an index segment:');
  for (const rel of indexSegmentRoutes) {
    console.error(`  - ${rel}`);
  }
  process.exit(1);
}
const apiJoined = apiListing.join('\n');
for (const symbol of ['decodeTransaction', 'decodeViemTypedData']) {
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
for (const route of ['not-this', 'design-decisions', 'support-policy']) {
  if (!home.includes(`href="/${base}/${route}/"`)) {
    throw new Error(`docs smoke: home page should link to /${route}/`);
  }
}

// Check published adoption pages, including sidebar links and fragment targets.
const site = 'https://miltontulli.github.io';
for (const route of ['design-decisions', 'support-policy', 'not-this', 'trust']) {
  const html = await readFile(join(root, route, 'index.html'), 'utf8');
  const pageUrl = `${site}/${base}/${route}/`;
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    const target = new URL(href, pageUrl);
    if (target.origin !== site || !target.pathname.startsWith(`/${base}/`)) continue;
    const rel = decodeURIComponent(target.pathname.slice(base.length + 2));
    const file = join(root, rel.endsWith('/') || rel === '' ? `${rel}index.html` : rel);
    if (!(await exists(file))) {
      throw new Error(`docs smoke: broken internal link on /${route}/: ${href}`);
    }
    if (target.hash && file.endsWith('.html')) {
      const destination = await readFile(file, 'utf8');
      const id = decodeURIComponent(target.hash.slice(1));
      if (!destination.includes(`id="${id}"`)) {
        throw new Error(`docs smoke: missing fragment on /${route}/: ${href}`);
      }
    }
  }
}

console.log(`docs smoke ok (${root})`);
