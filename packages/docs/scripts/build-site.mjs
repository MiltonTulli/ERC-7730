import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: pkg,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`@erc7730/docs requires Node >= 22.12 (got ${process.version})`);
  process.exit(1);
}

run('node', ['scripts/check-stale-phrases.mjs']);
run('node', ['scripts/include-canonical.mjs']);
run('node', ['scripts/check-quickstart.mjs']);
run('node', ['scripts/generate-cli-ref.mjs']);
run('pnpm', ['exec', 'astro', 'build']);
run('node', ['scripts/mount-demo.mjs']);
run('node', ['scripts/docs-smoke.mjs']);
