import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const sdkEntry = join(here, '../../sdk/dist/index.js');

function fail(message) {
  console.error(message);
  process.exit(1);
}

// `turbo build` already runs @erc7730/sdk#build first (`dependsOn: ["^build"]`).
// Rebuilding here makes tsdown delete dist while sibling tasks resolve the package.
if (process.env.TURBO_HASH) {
  if (!existsSync(sdkEntry)) {
    fail('@erc7730/sdk dist is missing. Turbo should have built @erc7730/sdk before @erc7730/web.');
  }
  console.log('Skipping @erc7730/sdk rebuild; Turbo already built it.');
  process.exit(0);
}

const result = spawnSync('pnpm', ['--filter', '@erc7730/sdk', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit',
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
if (!existsSync(sdkEntry)) {
  fail(`Missing ${sdkEntry} after @erc7730/sdk build.`);
}
