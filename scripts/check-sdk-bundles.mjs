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

const required = [
  'index.js',
  'index.d.ts',
  'attest.js',
  'attest.d.ts',
  'generate.js',
  'generate.d.ts',
  'sourcify.js',
  'sourcify.d.ts',
  'known-data.js',
  'known-data.d.ts',
  'legacy.js',
  'legacy.d.ts',
];
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

const rootBanned = [
  'fetchFromSourcify',
  'sourcify.dev',
  'generateDescriptor',
  'GENERATED_DESCRIPTOR_COMMENT',
  'looksLikeErc20',
  'KNOWN_ADDRESSES',
  'KNOWN_TOKENS',
  'knownDataProvider',
];
for (const token of rootBanned) {
  if (index.includes(token)) {
    fail(`dist/index.js graph still includes ${token}`);
  }
}
const movedOffRoot = [
  'getDefaultClearSignRegistry',
  'formatTypedData',
  'BUILTIN_DESCRIPTORS',
  'class Registry',
];
for (const token of movedOffRoot) {
  if (index.includes(token)) {
    fail(`dist/index.js graph still includes moved symbol ${token}`);
  }
}
const rootEntries = new Set(['generate.js', 'sourcify.js', 'known-data.js', 'legacy.js']);
for (const entry of indexGraph) {
  const base = entry.file.split('/').pop();
  if (rootEntries.has(base)) {
    fail(`dist/index.js graph reaches ${base}`);
  }
}

function graphText(file) {
  return relativeChunks(file)
    .map((entry) => entry.code)
    .join('\n');
}

const sourcifyGraph = graphText(join(dist, 'sourcify.js'));
if (!sourcifyGraph.includes('sourcify.dev') || !sourcifyGraph.includes('generateDescriptor')) {
  fail('dist/sourcify.js must contain the Sourcify client and descriptor authoring');
}
const knownData = readFileSync(join(dist, 'known-data.js'), 'utf8');
if (!knownData.includes('knownDataProvider') || !knownData.includes('KNOWN_TOKENS')) {
  fail('dist/known-data.js must export knownDataProvider and KNOWN_TOKENS');
}
const indexDts = readFileSync(join(dist, 'index.d.ts'), 'utf8');
const rootValues = [
  'clearSign',
  'createClearSigner',
  'decodeTransaction',
  'decodeTypedData',
  'decodeBatch',
  'decodeUserOp',
  'decodeViemTypedData',
  'toScreens',
  'renderScreensText',
  'screenVerification',
  'createOfficialRegistry',
  'fetchPrebuiltRegistryIndex',
  'createMemoryDescriptorCache',
  'validateDescriptor',
  'validateDescriptorTests',
  'resolveDescriptor',
  'descriptorHash',
  'resolvePath',
  'matchContext',
  'officialOnlyPolicy',
  'officialOrLocalPolicy',
  'composePolicies',
  'Erc7730Error',
  'InvalidInputError',
  'DescriptorResolveError',
  'OfficialRegistryError',
  'PathResolveError',
  'VENDORED_REGISTRY_COMMIT',
  'TRUST_REASON_CODES',
  'SECURITY_WARNING_TYPES',
];
const declared = new Set();
const exportDecl =
  /export\s+declare\s+(?:async\s+)?(?:function|const|class|enum)\s+([A-Za-z0-9_]+)/g;
for (const match of indexDts.matchAll(exportDecl)) {
  declared.add(match[1]);
}
const exportList = /export\s+\{([^}]+)\}/g;
for (const match of indexDts.matchAll(exportList)) {
  for (const part of match[1].split(',')) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.startsWith('type ')) {
      continue;
    }
    const name = trimmed
      .split(/\s+as\s+/)
      .pop()
      ?.trim();
    if (name) {
      declared.add(name);
    }
  }
}
const missing = rootValues.filter((name) => !declared.has(name));
const extra = [...declared].filter((name) => !rootValues.includes(name)).sort();
if (missing.length > 0 || extra.length > 0 || declared.size > 30) {
  fail(
    `dist/index.d.ts value exports must be the 30-name root surface.\nmissing: ${missing.join(', ') || '(none)'}\nextra: ${extra.join(', ') || '(none)'}\ncount: ${declared.size}`
  );
}
for (const token of [
  'generateDescriptor',
  'generateFunctionDescriptor',
  'inferIntent',
  'inferFormat',
  'inferLabel',
  'looksLikeErc20',
  'V2_SCHEMA_URI',
  'GENERATED_DESCRIPTOR_COMMENT',
  'fetchFromSourcify',
  'isVerifiedOnSourcify',
  'sourcifyVerifiedAbiLoader',
  'KNOWN_TOKENS',
  'KNOWN_ADDRESSES',
  'knownDataProvider',
]) {
  if (new RegExp(`\\b${token}\\b`).test(indexDts)) {
    fail(`dist/index.d.ts still names ${token}`);
  }
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
