import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['packages/sdk/src', 'packages/cli/src'];

const regexPredecessor =
  /(?:^|[\n;{}=(:,?[&|!~^]|return|throw|case|delete|void|typeof|await|yield|else|do|in|of)$/;

/**
 * @param {string} source
 * @returns {Array<{ pattern: string; index: number }>}
 */
export function regexLiterals(source) {
  /** @type {Array<{ pattern: string; index: number }>} */
  const found = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) {
        break;
      }
      continue;
    }
    if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"') {
      i = skipString(source, i, char);
      continue;
    }
    if (char === '`') {
      i = skipTemplate(source, i);
      continue;
    }
    if (char === '/' && isRegexStart(source, i)) {
      const parsed = readRegexLiteral(source, i);
      if (parsed) {
        found.push(parsed);
        i = parsed.end;
        continue;
      }
    }
    if (source.startsWith('new RegExp(', i)) {
      const parsed = readRegExpConstructor(source, i);
      if (parsed) {
        found.push(parsed);
        i = parsed.end;
        continue;
      }
    }
    i += 1;
  }
  return found;
}

/**
 * A group quantified with `*`, `+`, or `{n,}` whose body also has a quantifier.
 * CodeQL reports that shape as polynomial backtracking on untrusted input.
 *
 * @param {string} pattern
 * @returns {boolean}
 */
export function hasNestedUnboundedQuantifier(pattern) {
  return scanGroups(pattern, 0, pattern.length);
}

/**
 * @param {string} source
 * @param {string} file
 * @returns {string[]}
 */
export function nestedQuantifierMessages(source, file) {
  /** @type {string[]} */
  const messages = [];
  for (const literal of regexLiterals(source)) {
    if (!hasNestedUnboundedQuantifier(literal.pattern)) {
      continue;
    }
    const line = source.slice(0, literal.index).split('\n').length;
    messages.push(`${file}:${line}: nested quantifier /${literal.pattern}/`);
  }
  return messages;
}

function main() {
  /** @type {string[]} */
  const messages = [];
  for (const dir of roots) {
    for (const file of walk(join(root, dir))) {
      if (!file.endsWith('.ts') && !file.endsWith('.mjs') && !file.endsWith('.js')) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      messages.push(...nestedQuantifierMessages(source, relative(root, file)));
    }
  }
  if (messages.length > 0) {
    console.error(messages.join('\n'));
    console.error(
      '\nRewrite the match as a linear scan. A quantified group that itself contains a quantifier is a CodeQL polynomial-ReDoS finding.'
    );
    process.exit(1);
  }
  console.log('nested quantifiers ok');
}

/**
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
 * @param {string} source
 * @param {number} start
 * @returns {{ pattern: string; index: number; end: number } | null}
 */
function readRegexLiteral(source, start) {
  let i = start + 1;
  let pattern = '';
  while (i < source.length) {
    const char = source[i];
    if (char === '\n') {
      return null;
    }
    if (char === '\\') {
      pattern += char + (source[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (char === '[') {
      const end = skipClass(source, i);
      pattern += source.slice(i, end);
      i = end;
      continue;
    }
    if (char === '/') {
      return { pattern, index: start, end: i + 1 };
    }
    pattern += char;
    i += 1;
  }
  return null;
}

/**
 * @param {string} source
 * @param {number} start
 * @returns {{ pattern: string; index: number; end: number } | null}
 */
function readRegExpConstructor(source, start) {
  const open = source.indexOf('(', start);
  let i = open + 1;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n')) {
    i += 1;
  }
  const quote = source[i];
  if (quote !== "'" && quote !== '"') {
    return null;
  }
  const endQuote = skipString(source, i, quote);
  const raw = source.slice(i + 1, endQuote - 1);
  return { pattern: unescapePattern(raw), index: start, end: endQuote };
}

/**
 * @param {string} raw
 */
function unescapePattern(raw) {
  return raw.replace(/\\(.)/g, '$1');
}

/**
 * @param {string} source
 * @param {number} start
 * @param {string} quote
 */
function skipString(source, start, quote) {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === quote) {
      return i + 1;
    }
    i += 1;
  }
  return source.length;
}

/**
 * @param {string} source
 * @param {number} start
 */
function skipTemplate(source, start) {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === '`') {
      return i + 1;
    }
    i += 1;
  }
  return source.length;
}

/**
 * @param {string} pattern
 * @param {number} start
 * @param {number} end
 */
function scanGroups(pattern, start, end) {
  let i = start;
  while (i < end) {
    const char = pattern[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '[') {
      i = skipClass(pattern, i);
      continue;
    }
    if (char === '(') {
      const close = findGroupEnd(pattern, i, end);
      const bodyStart = groupBodyStart(pattern, i);
      const quantifier = readQuantifier(pattern, close + 1, end);
      const bodyHasQuantifier = containsQuantifier(pattern, bodyStart, close);
      if (quantifier?.unbounded && bodyHasQuantifier) {
        return true;
      }
      if (scanGroups(pattern, bodyStart, close)) {
        return true;
      }
      i = quantifier ? quantifier.end : close + 1;
      continue;
    }
    i += 1;
  }
  return false;
}

/**
 * @param {string} pattern
 * @param {number} start
 * @param {number} end
 */
function containsQuantifier(pattern, start, end) {
  let i = start;
  while (i < end) {
    const char = pattern[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '[') {
      i = skipClass(pattern, i);
      continue;
    }
    if (char === '(') {
      const close = findGroupEnd(pattern, i, end);
      if (containsQuantifier(pattern, groupBodyStart(pattern, i), close)) {
        return true;
      }
      const quantifier = readQuantifier(pattern, close + 1, end);
      if (quantifier) {
        return true;
      }
      i = close + 1;
      continue;
    }
    if (char === '*' || char === '+') {
      return true;
    }
    if (char === '{') {
      const quantifier = readQuantifier(pattern, i, end);
      if (quantifier?.unbounded) {
        return true;
      }
      if (quantifier) {
        i = quantifier.end;
        continue;
      }
    }
    i += 1;
  }
  return false;
}

/**
 * @param {string} pattern
 * @param {number} open
 */
function groupBodyStart(pattern, open) {
  if (pattern[open + 1] !== '?') {
    return open + 1;
  }
  const marker = pattern[open + 2];
  if (marker === ':' || marker === '=' || marker === '!') {
    return open + 3;
  }
  if (marker === '<') {
    const next = pattern[open + 3];
    if (next === '=' || next === '!') {
      return open + 4;
    }
    const nameEnd = pattern.indexOf('>', open + 3);
    return nameEnd === -1 ? open + 3 : nameEnd + 1;
  }
  return open + 1;
}

/**
 * @param {string} pattern
 * @param {number} open
 * @param {number} limit
 */
function findGroupEnd(pattern, open, limit) {
  let depth = 0;
  let i = open;
  while (i < limit) {
    const char = pattern[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '[') {
      i = skipClass(pattern, i);
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
    i += 1;
  }
  return limit - 1;
}

/**
 * @param {string} pattern
 * @param {number} start
 */
function skipClass(pattern, start) {
  let i = start + 1;
  if (pattern[i] === '^') {
    i += 1;
  }
  if (pattern[i] === ']') {
    i += 1;
  }
  while (i < pattern.length) {
    if (pattern[i] === '\\') {
      i += 2;
      continue;
    }
    if (pattern[i] === ']') {
      return i + 1;
    }
    i += 1;
  }
  return pattern.length;
}

/**
 * @param {string} pattern
 * @param {number} start
 * @param {number} limit
 * @returns {{ unbounded: boolean; end: number } | null}
 */
function readQuantifier(pattern, start, limit) {
  if (start >= limit) {
    return null;
  }
  const char = pattern[start];
  if (char === '*' || char === '+') {
    const lazy = pattern[start + 1] === '?' ? 1 : 0;
    return { unbounded: true, end: start + 1 + lazy };
  }
  if (char === '?') {
    const lazy = pattern[start + 1] === '?' ? 1 : 0;
    return { unbounded: false, end: start + 1 + lazy };
  }
  if (char !== '{') {
    return null;
  }
  const close = pattern.indexOf('}', start + 1);
  if (close === -1 || close >= limit) {
    return null;
  }
  const body = pattern.slice(start + 1, close);
  if (!/^\d+(,\d*)?$/.test(body)) {
    return null;
  }
  const lazy = pattern[close + 1] === '?' ? 1 : 0;
  const unbounded = body.endsWith(',') || /,\s*$/.test(body);
  return { unbounded, end: close + 1 + lazy };
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  /** @type {string[]} */
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (statSync(full).isFile()) {
      files.push(full);
    }
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
