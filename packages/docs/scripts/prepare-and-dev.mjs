import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: pkg, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('node', ['scripts/include-canonical.mjs']);
run('node', ['scripts/generate-cli-ref.mjs']);
const child = spawnSync('pnpm', ['exec', 'astro', 'dev', '--host', '127.0.0.1'], {
  cwd: pkg,
  stdio: 'inherit',
});
process.exit(child.status ?? 1);
