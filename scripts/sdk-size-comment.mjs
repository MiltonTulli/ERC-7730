// Formats `size-limit --json` output for the base and head builds as a PR comment.
// Usage: node scripts/sdk-size-comment.mjs <base.json> <head.json> <config.json>
import { readFileSync } from 'node:fs';

export const MARKER = '<!-- erc7730-sdk-size -->';

function readResults(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return new Map(parsed.map((entry) => [entry.name, entry]));
  } catch {
    return new Map();
  }
}

function kb(bytes) {
  return `${(bytes / 1000).toFixed(2)} KB`;
}

function delta(base, head) {
  if (base === undefined) {
    return 'new';
  }
  const diff = head - base;
  if (diff === 0) {
    return '0';
  }
  const pct = base === 0 ? '' : ` (${diff > 0 ? '+' : ''}${((diff / base) * 100).toFixed(1)}%)`;
  return `${diff > 0 ? '+' : '-'}${kb(Math.abs(diff))}${pct}`;
}

export function renderComment(base, head, limits) {
  const rows = [...head.values()].map((entry) => {
    const before = base.get(entry.name)?.size;
    const status = entry.passed === false ? 'over limit' : 'ok';
    const limit = limits.get(entry.name) ?? '—';
    return `| \`${entry.name}\` | ${before === undefined ? '—' : kb(before)} | ${kb(entry.size)} | ${delta(before, entry.size)} | ${limit} | ${status} |`;
  });
  return [
    MARKER,
    '### `@erc7730/sdk` bundle size',
    '',
    'Minified and gzipped, runtime dependencies excluded (`packages/sdk/.size-limit.json`).',
    '',
    '| Entry | Base | PR | Delta | Limit | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [basePath, headPath, configPath] = process.argv.slice(2);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const limits = new Map(config.map((entry) => [entry.name, entry.limit]));
  process.stdout.write(renderComment(readResults(basePath), readResults(headPath), limits));
}
