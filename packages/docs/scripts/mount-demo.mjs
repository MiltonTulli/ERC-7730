import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webDist = join(here, '../../web/dist');
const docsDist = join(here, '../dist');
const demoDest = join(docsDist, 'demo');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Outside GitHub Actions, always rebuild. A leftover web dist may have been
// produced with base `/` even if ERC7730_DOCS_SITE is already set in the env.
const needsRebuild = !(await exists(join(webDist, 'index.html'))) || !process.env.GITHUB_ACTIONS;

if (needsRebuild) {
  console.log('Building @erc7730/web with docs-site base /ERC-7730/demo/ …');
  const result = spawnSync('pnpm', ['--filter', '@erc7730/web', 'build'], {
    cwd: join(here, '../../..'),
    stdio: 'inherit',
    env: { ...process.env, ERC7730_DOCS_SITE: '1' },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!(await exists(join(webDist, 'index.html')))) {
  console.error('packages/web/dist/index.html missing after web build');
  process.exit(1);
}

await rm(demoDest, { recursive: true, force: true });
await mkdir(demoDest, { recursive: true });
await cp(webDist, demoDest, { recursive: true });
console.log(`mounted demo → ${demoDest}`);
