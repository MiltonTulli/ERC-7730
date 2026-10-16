import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readChangesets } from '@changesets/read';
import { packages } from './release-policy.mjs';

// Changesets normally bumps dependents too. Published packages here opt into a
// release through their own changesets; a workspace SDK bump alone must not ship CLI.
const run = (...args) => execFileSync('pnpm', args, { stdio: 'inherit' });
if (process.env.GITHUB_REF_NAME === 'next' && !existsSync('.changeset/pre.json')) {
  run('changeset', 'pre', 'enter', 'next');
}
const pre = existsSync('.changeset/pre.json')
  ? JSON.parse(readFileSync('.changeset/pre.json', 'utf8'))
  : undefined;
const changesets = (await readChangesets(process.cwd())).filter(
  (c) => pre?.mode !== 'pre' || !c.id.startsWith('pre/')
);
const selected = new Set(changesets.flatMap((c) => c.releases.map((r) => r.name)));
const preserved = new Map();
for (const pkg of packages) {
  if (selected.has(`@erc7730/${pkg}`)) continue;
  for (const file of ['package.json', 'CHANGELOG.md']) {
    const path = `packages/${pkg}/${file}`;
    preserved.set(path, existsSync(path) ? readFileSync(path) : undefined);
  }
}
run('changeset', 'version');
for (const [path, contents] of preserved) {
  if (contents === undefined) rmSync(path, { force: true });
  else writeFileSync(path, contents);
}
// Keep the workspace lockfile in sync with Version PR manifest updates.
run('install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts');
run('exec', 'biome', 'check', '--write', 'packages/sdk/package.json', 'packages/cli/package.json');
