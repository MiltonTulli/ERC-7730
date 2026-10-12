import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageFiles = ['packages/sdk/package.json', 'packages/cli/package.json'];
const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const scopedName = /@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?/gi;

/**
 * Names in the prose that the diff never touches.
 * Frontmatter bump targets (`"@erc7730/sdk": patch`) are exempt.
 *
 * @param {string} body
 * @param {string} diffText
 * @param {Iterable<string>} dependencyNames
 * @param {Iterable<string>} frontmatterPackages
 * @returns {string[]}
 */
export function claimsMissingFromDiff(body, diffText, dependencyNames, frontmatterPackages) {
  const exempt = new Set(frontmatterPackages);
  /** @type {Set<string>} */
  const missing = new Set();
  for (const token of body.match(scopedName) ?? []) {
    if (exempt.has(token)) {
      continue;
    }
    if (!diffText.includes(token)) {
      missing.add(token);
    }
  }
  for (const name of dependencyNames) {
    if (name.startsWith('@') || !isWord(body, name)) {
      continue;
    }
    if (!diffText.includes(name)) {
      missing.add(name);
    }
  }
  return [...missing];
}

/**
 * @param {string} text
 * @returns {{ packages: string[]; body: string }}
 */
export function parseChangeset(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const frontmatter = match?.[1] ?? '';
  const body = match?.[2] ?? text;
  /** @type {string[]} */
  const packages = [];
  for (const line of frontmatter.split('\n')) {
    const found = line.match(/^"(@[^"]+)"\s*:/);
    if (found?.[1]) {
      packages.push(found[1]);
    }
  }
  return { packages, body };
}

/**
 * @param {string} text
 * @param {string} word
 */
function isWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w@/.-])${escaped}(?![\\w@/.-])`).test(text);
}

/**
 * @param {string} json
 * @returns {string[]}
 */
export function dependencyNames(json) {
  /** @type {string[]} */
  const names = [];
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return names;
  }
  for (const field of depFields) {
    const table = parsed[field];
    if (table && typeof table === 'object') {
      names.push(...Object.keys(table));
    }
  }
  return names;
}

function main() {
  const base = process.argv[2] || resolveBase();
  const diffText = [
    git(['diff', `${base}...HEAD`, '--', '.', ':(exclude).changeset']),
    git(['diff', 'HEAD', '--', '.', ':(exclude).changeset']),
    git(['diff', '--cached', '--', '.', ':(exclude).changeset']),
    untrackedCorpus(),
  ].join('\n');
  /** @type {Set<string>} */
  const deps = new Set();
  for (const file of packageFiles) {
    for (const name of dependencyNames(readOptional(join(root, file)))) {
      deps.add(name);
    }
    for (const name of dependencyNames(git(['show', `${base}:${file}`]))) {
      deps.add(name);
    }
  }

  /** @type {string[]} */
  const problems = [];
  for (const file of changesetFiles(base)) {
    const text = readOptional(join(root, file));
    const parsed = parseChangeset(text);
    const missing = claimsMissingFromDiff(parsed.body, diffText, deps, parsed.packages);
    for (const name of missing) {
      problems.push(
        `${file}: names "${name}", which is not in the diff. A changeset describes only this pull request.`
      );
    }
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('changeset claims ok');
}

function resolveBase() {
  for (const ref of ['origin/main', 'main']) {
    if (git(['rev-parse', '--verify', '--quiet', ref]).trim()) {
      return ref;
    }
  }
  console.error('No base ref. Pass origin/main.');
  process.exit(1);
}

/**
 * @param {string} base
 * @returns {string[]}
 */
function changesetFiles(base) {
  const listed = [
    git(['diff', '--name-only', `${base}...HEAD`, '--', '.changeset']),
    git(['diff', '--name-only', 'HEAD', '--', '.changeset']),
    git(['diff', '--name-only', '--cached', '--', '.changeset']),
    git(['ls-files', '--others', '--exclude-standard', '--', '.changeset']),
  ].join('\n');
  return [
    ...new Set(
      listed
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.endsWith('.md') && !line.endsWith('README.md'))
    ),
  ];
}

/**
 * @param {string[]} args
 */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  } catch (error) {
    const stdout =
      error && typeof error === 'object' && 'stdout' in error ? String(error.stdout ?? '') : '';
    return stdout;
  }
}

/**
 * @param {string} file
 */
function untrackedCorpus() {
  const listed = git(['ls-files', '--others', '--exclude-standard']);
  /** @type {string[]} */
  const chunks = [];
  for (const rel of listed.split('\n')) {
    const file = rel.trim();
    if (!file || file.startsWith('.changeset/')) {
      continue;
    }
    const text = readOptional(join(root, file));
    if (text.length > 0 && text.length < 200_000) {
      chunks.push(text);
    }
  }
  return chunks.join('\n');
}

function readOptional(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
