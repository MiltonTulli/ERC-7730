import { readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Published package entries. Docs have to sit on the resolved declaration. */
export const entryPoints = [
  'packages/sdk/src/index.ts',
  'packages/sdk/src/attest.ts',
  'packages/sdk/src/generate/index.ts',
  'packages/sdk/src/sourcify.ts',
  'packages/sdk/src/known-data.ts',
];

const declPattern =
  /(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(function|class|interface|enum|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const exportNamedPattern = /export\s+type\s+\{|export\s+\{/g;
const exportStarPattern = /export\s+(?:type\s+)?\*\s+from\s+(['"])([^'"]+)\1/g;
const importNamedPattern =
  /import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,\s*)?(?:([A-Za-z_$][\w$]*)\s+)?\{([^}]*)\}\s+from\s+(['"])([^'"]+)\4/g;
const importDefaultPattern =
  /import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+(['"])([^'"]+)\2/g;

/**
 * @param {string} source
 * @returns {{ code: string; comments: Array<{ start: number; end: number; doc: boolean }> }}
 */
export function maskSource(source) {
  const code = source.split('');
  /** @type {Array<{ start: number; end: number; doc: boolean }>} */
  const comments = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];
    if (char === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : close + 2;
      const doc = source[i + 2] === '*';
      comments.push({ start: i, end, doc });
      blank(code, i, end);
      i = end;
      continue;
    }
    if (char === '/' && next !== '/' && isRegexStart(source, i)) {
      const end = skipRegexLiteral(source, i);
      if (end > i) {
        blank(code, i, end);
        i = end;
        continue;
      }
    }
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(code, i, stop);
      i = stop;
      continue;
    }
    if (char === "'" || char === '"') {
      i = blankString(source, code, i, char);
      continue;
    }
    if (char === '`') {
      i = blankTemplate(source, code, i);
      continue;
    }
    i += 1;
  }
  return { code: code.join(''), comments };
}

/**
 * @param {string[]} code
 * @param {number} from
 * @param {number} to
 */
function blank(code, from, to) {
  for (let i = from; i < to; i += 1) {
    if (code[i] !== '\n') {
      code[i] = ' ';
    }
  }
}

/**
 * @param {string} source
 * @param {string[]} code
 * @param {number} start
 * @param {string} quote
 */
function blankString(source, code, start, quote) {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === quote) {
      blank(code, start, i + 1);
      return i + 1;
    }
    if (source[i] === '\n') {
      break;
    }
    i += 1;
  }
  blank(code, start, i);
  return i;
}

/**
 * Mask a template literal, including nested templates inside `${}`.
 * Expression braces stay visible so module brace depth ignores them only
 * when they belong to the template itself.
 *
 * @param {string} source
 * @param {string[]} code
 * @param {number} start
 */
function blankTemplate(source, code, start) {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === '`') {
      blank(code, start, i + 1);
      return i + 1;
    }
    if (source[i] === '$' && source[i + 1] === '{') {
      code[i] = ' ';
      code[i + 1] = ' ';
      i = blankTemplateExpression(source, code, i + 2);
      continue;
    }
    if (source[i] !== '\n') {
      code[i] = ' ';
    }
    i += 1;
  }
  blank(code, start, i);
  return i;
}

/**
 * @param {string} source
 * @param {string[]} code
 * @param {number} start
 */
function blankTemplateExpression(source, code, start) {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const char = source[i];
    const next = source[i + 1];
    if (char === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : close + 2;
      blank(code, i, end);
      i = end;
      continue;
    }
    if (char === '/' && next !== '/' && isRegexStart(source, i)) {
      const end = skipRegexLiteral(source, i);
      if (end > i) {
        i = end;
        continue;
      }
    }
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(code, i, stop);
      i = stop;
      continue;
    }
    if (char === "'" || char === '"') {
      i = blankString(source, code, i, char);
      continue;
    }
    if (char === '`') {
      i = blankTemplate(source, code, i);
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        code[i] = ' ';
        return i + 1;
      }
    }
    i += 1;
  }
  return i;
}

const regexPredecessor =
  /(?:^|[\n;{}=(:,?[&|!~^]|return|throw|case|delete|void|typeof|await|yield|else|do|in|of)$/;

/**
 * `/` starts a regex when the previous token cannot end an expression.
 * `//` stays a line comment: an empty pattern is not treated as a regex.
 *
 * @param {string} source
 * @param {number} slash
 */
function isRegexStart(source, slash) {
  let j = slash - 1;
  while (j >= 0 && (source[j] === ' ' || source[j] === '\t' || source[j] === '\n')) {
    j -= 1;
  }
  if (j < 0) {
    return true;
  }
  const before = source.slice(Math.max(0, j - 12), j + 1);
  return regexPredecessor.test(before);
}

/**
 * Index just after the closing slash and its flags. 0 when `start` is not a regex.
 *
 * @param {string} source
 * @param {number} start
 */
function skipRegexLiteral(source, start) {
  let i = start + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === '\n') {
      return 0;
    }
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '[') {
      i += 1;
      while (i < source.length && source[i] !== '\n') {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === ']') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (char === '/') {
      i += 1;
      while (i < source.length && /[a-z]/i.test(source[i] ?? '')) {
        i += 1;
      }
      return i;
    }
    i += 1;
  }
  return 0;
}

/**
 * @param {string} code
 * @returns {number[]}
 */
function braceDepth(code) {
  const depth = new Array(code.length);
  let current = 0;
  for (let i = 0; i < code.length; i += 1) {
    depth[i] = current;
    const char = code[i];
    if (char === '{') {
      current += 1;
    } else if (char === '}') {
      current = Math.max(0, current - 1);
    }
  }
  return depth;
}

/**
 * @param {string} source
 */
export function parseModule(source) {
  const { code, comments } = maskSource(source);
  const depth = braceDepth(code);
  /** @type {Map<string, { name: string; documented: boolean; exported: boolean }>} */
  const declarations = new Map();
  /** @type {Array<{ specs: Array<{ local: string; exported: string }>; from: string | null }>} */
  const clauses = [];
  /** @type {string[]} */
  const stars = [];
  /** @type {Map<string, { imported: string; from: string }>} */
  const imports = new Map();

  for (const match of source.matchAll(declPattern)) {
    const index = match.index ?? 0;
    if (code[index] === ' ' || (depth[index] ?? 0) !== 0 || !isStatementBoundary(code, index)) {
      continue;
    }
    const name = match[2];
    if (!name) {
      continue;
    }
    const documented = attached(comments, index, source);
    const exported = match[0].startsWith('export');
    const previous = declarations.get(name);
    if (!previous) {
      declarations.set(name, { name, documented, exported });
      continue;
    }
    if (documented) {
      previous.documented = true;
    }
    if (exported) {
      previous.exported = true;
    }
  }

  for (const match of source.matchAll(exportNamedPattern)) {
    const index = match.index ?? 0;
    if (code[index] === ' ' || (depth[index] ?? 0) !== 0 || !isStatementBoundary(code, index)) {
      continue;
    }
    const open = source.indexOf('{', index);
    const close = open === -1 ? -1 : closingBrace(code, open);
    if (open === -1 || close === -1) {
      continue;
    }
    const specs = parseSpecifiers(code.slice(open + 1, close));
    const tail = source.slice(close + 1, close + 200);
    const from = tail.match(/^\s*from\s+(['"])([^'"]+)\1/);
    clauses.push({ specs, from: from?.[2] ?? null });
  }

  for (const match of source.matchAll(exportStarPattern)) {
    const index = match.index ?? 0;
    if (code[index] === ' ' || (depth[index] ?? 0) !== 0 || !isStatementBoundary(code, index)) {
      continue;
    }
    if (match[2]) {
      stars.push(match[2]);
    }
  }

  for (const match of source.matchAll(importNamedPattern)) {
    const index = match.index ?? 0;
    if (code[index] === ' ' || (depth[index] ?? 0) !== 0) {
      continue;
    }
    const from = match[5];
    if (!from) {
      continue;
    }
    if (match[1]) {
      imports.set(match[1], { imported: 'default', from });
    }
    for (const spec of parseSpecifiers(match[3] ?? '')) {
      imports.set(spec.exported, { imported: spec.local, from });
    }
  }

  for (const match of source.matchAll(importDefaultPattern)) {
    const index = match.index ?? 0;
    if (code[index] === ' ' || (depth[index] ?? 0) !== 0) {
      continue;
    }
    const name = match[1];
    const from = match[3];
    if (!name || !from || name === 'type' || imports.has(name)) {
      continue;
    }
    imports.set(name, { imported: 'default', from });
  }

  return { declarations, clauses, stars, imports };
}

/**
 * @param {Array<{ start: number; end: number; doc: boolean }>} comments
 * @param {number} statementStart
 * @param {string} source
 */
function attached(comments, statementStart, source) {
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const comment = comments[i];
    if (!comment || comment.end > statementStart) {
      continue;
    }
    if (!comment.doc) {
      return false;
    }
    const gap = source.slice(comment.end, statementStart);
    if (gap.trim() !== '') {
      return false;
    }
    if (/\n[ \t]*\n/.test(gap)) {
      return false;
    }
    const lines = source
      .slice(comment.start + 3, comment.end - 2)
      .split('\n')
      .map((line) => line.replace(/^\s*\* ?/, '').trim())
      .filter((line) => line.length > 0);
    const summary = lines.some((line) => !line.startsWith('@'));
    const deprecationReason = lines.some((line) => /^@deprecated\s+\S/.test(line));
    return summary || deprecationReason;
  }
  return false;
}

/**
 * @param {string} code
 * @param {number} open
 */
function closingBrace(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') {
      depth += 1;
    } else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * @param {string} code
 * @param {number} index
 */
function isStatementBoundary(code, index) {
  let i = index - 1;
  while (i >= 0 && (code[i] === ' ' || code[i] === '\t')) {
    i -= 1;
  }
  if (i < 0) {
    return true;
  }
  const char = code[i];
  return char === '\n' || char === ';' || char === '}';
}

/**
 * @param {string} inner
 * @returns {Array<{ local: string; exported: string }>}
 */
function parseSpecifiers(inner) {
  /** @type {Array<{ local: string; exported: string }>} */
  const specs = [];
  for (const part of inner.split(',')) {
    const tokens = part
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0 && token !== 'type');
    const local = tokens[0];
    if (!local || !/^[A-Za-z_$][\w$]*$/.test(local)) {
      continue;
    }
    const exported = tokens[1] === 'as' ? tokens[2] : local;
    if (!exported || !/^[A-Za-z_$][\w$]*$/.test(exported)) {
      continue;
    }
    specs.push({ local, exported });
  }
  return specs;
}

/**
 * @param {string} fromFile
 * @param {string} spec
 * @param {(file: string) => boolean} exists
 */
export function resolveSpecifier(fromFile, spec, exists) {
  if (!spec.startsWith('.')) {
    return null;
  }
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, join(base, 'index.ts')];
  for (const candidate of candidates) {
    if (exists(candidate) && candidate.endsWith('.ts')) {
      return candidate;
    }
  }
  return null;
}

/**
 * @param {string} repoRoot
 * @param {string[]} entries
 * @param {{ read?: (file: string) => string; exists?: (file: string) => boolean }} [io]
 * @returns {Array<{ entry: string; name: string; file: string | null; documented: boolean }>}
 */
export function rootExportDocs(repoRoot, entries, io = {}) {
  /** @type {Map<string, ReturnType<typeof parseModule>>} */
  const cache = new Map();
  const read = io.read ?? ((file) => readFileSync(file, 'utf8'));
  const exists = io.exists ?? ((file) => fileExists(file));

  /**
   * @param {string} file
   */
  function moduleOf(file) {
    const cached = cache.get(file);
    if (cached) {
      return cached;
    }
    const parsed = parseModule(read(file));
    cache.set(file, parsed);
    return parsed;
  }

  /**
   * @param {string} file
   * @param {string} name
   * @param {Set<string>} seen
   * @returns {{ file: string; documented: boolean } | null}
   */
  function declarationOf(file, name, seen) {
    const key = `${file}#${name}`;
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    const mod = moduleOf(file);
    for (const clause of mod.clauses) {
      for (const spec of clause.specs) {
        if (spec.exported !== name) {
          continue;
        }
        if (clause.from) {
          const next = resolveSpecifier(file, clause.from, exists);
          if (!next) {
            return null;
          }
          return declarationOf(next, spec.local, seen);
        }
        return localDeclaration(file, spec.local, seen);
      }
    }
    const own = mod.declarations.get(name);
    if (own?.exported) {
      return { file, documented: own.documented };
    }
    for (const star of mod.stars) {
      const next = resolveSpecifier(file, star, exists);
      if (!next) {
        continue;
      }
      const found = declarationOf(next, name, seen);
      if (found) {
        return found;
      }
    }
    if (own) {
      return { file, documented: own.documented };
    }
    return null;
  }

  /**
   * @param {string} file
   * @param {string} name
   * @param {Set<string>} seen
   * @returns {{ file: string; documented: boolean } | null}
   */
  function localDeclaration(file, name, seen) {
    const mod = moduleOf(file);
    const own = mod.declarations.get(name);
    if (own) {
      return { file, documented: own.documented };
    }
    const imported = mod.imports.get(name);
    if (!imported) {
      return declarationOf(file, name, seen);
    }
    const next = resolveSpecifier(file, imported.from, exists);
    if (!next) {
      return null;
    }
    if (imported.imported === 'default') {
      return null;
    }
    return declarationOf(next, imported.imported, seen);
  }

  /**
   * @param {string} file
   * @param {Set<string>} seen
   * @returns {Set<string>}
   */
  function exportedNames(file, seen) {
    if (seen.has(file)) {
      return new Set();
    }
    const nextSeen = new Set(seen);
    nextSeen.add(file);
    const mod = moduleOf(file);
    const names = new Set();
    for (const clause of mod.clauses) {
      for (const spec of clause.specs) {
        names.add(spec.exported);
      }
    }
    for (const decl of mod.declarations.values()) {
      if (decl.exported) {
        names.add(decl.name);
      }
    }
    for (const star of mod.stars) {
      const next = resolveSpecifier(file, star, exists);
      if (!next) {
        continue;
      }
      for (const name of exportedNames(next, nextSeen)) {
        names.add(name);
      }
    }
    return names;
  }

  /** @type {Array<{ entry: string; name: string; file: string | null; documented: boolean }>} */
  const rows = [];
  for (const entry of entries) {
    const file = join(repoRoot, entry);
    for (const name of exportedNames(file, new Set())) {
      const resolved = declarationOf(file, name, new Set());
      rows.push({
        entry,
        name,
        file: resolved?.file ?? null,
        documented: resolved?.documented ?? false,
      });
    }
  }
  return rows;
}

/**
 * @param {string} file
 */
function fileExists(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} repoRoot
 * @param {string[]} [entries]
 * @returns {string[]}
 */
export function missingTsdoc(repoRoot, entries = entryPoints) {
  return rootExportDocs(repoRoot, entries)
    .filter((row) => !row.documented)
    .map((row) => {
      const where = row.file ? relative(repoRoot, row.file) : 'unresolved';
      return `${row.entry}: ${row.name} (${where}) has no TSDoc summary`;
    });
}

function main() {
  const missing = missingTsdoc(root);
  if (missing.length > 0) {
    console.error(`check-tsdoc: ${missing.length} root export(s) have no TSDoc summary`);
    for (const line of missing) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }
  const total = rootExportDocs(root, entryPoints).length;
  console.log(`check-tsdoc ok (${total} root exports)`);
}

const executed = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executed) {
  main();
}
