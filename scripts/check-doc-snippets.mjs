import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Reader-facing samples. Continuation fences are marked and skipped. */
export const snippetFiles = [
  'README.md',
  'packages/sdk/README.md',
  'packages/cli/README.md',
  'packages/registry/README.md',
  'docs/GUIDE.md',
  'docs/migrating-to-1.0.md',
  'packages/docs/src/content/docs/sdk/validate-resolve.md',
  'packages/docs/src/content/docs/index.mdx',
  'packages/docs/src/content/docs/sdk.mdx',
  'packages/docs/src/content/docs/registry.md',
];

const chainedExtend = /createOfficialRegistry\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*extend\b/;
const fencePattern = /```(?:ts|typescript)\r?\n([\s\S]*?)```/g;
const continuesMark = /snippet:\s*continues/;

/**
 * The mark has to sit on the fence, with only blank lines between them.
 * A mark on an earlier fence does not carry forward.
 *
 * @param {string} source
 * @param {number} fenceIndex
 */
function continuesImmediatelyBefore(source, fenceIndex) {
  const lines = source.slice(0, fenceIndex).split('\n');
  let i = lines.length - 1;
  while (i >= 0 && (lines[i] ?? '').trim() === '') {
    i -= 1;
  }
  if (i < 0) {
    return false;
  }
  return continuesMark.test(lines[i] ?? '');
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function chainedExtendHits(source) {
  /** @type {string[]} */
  const hits = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (chainedExtend.test(lines[i] ?? '')) {
      hits.push(String(i + 1));
    }
  }
  return hits;
}

/**
 * @param {string} source
 * @returns {Array<{ code: string; line: number; continues: boolean }>}
 */
export function typescriptFences(source) {
  /** @type {Array<{ code: string; line: number; continues: boolean }>} */
  const fences = [];
  for (const match of source.matchAll(fencePattern)) {
    const index = match.index ?? 0;
    const line = source.slice(0, index).split('\n').length;
    fences.push({
      code: match[1] ?? '',
      line,
      continues: continuesImmediatelyBefore(source, index),
    });
  }
  return fences;
}

function main() {
  /** @type {string[]} */
  const problems = [];
  /** @type {Array<{ file: string; line: number; code: string }>} */
  const pasteable = [];

  for (const rel of snippetFiles) {
    const text = readFileSync(join(root, rel), 'utf8');
    for (const line of chainedExtendHits(text)) {
      problems.push(
        `${rel}:${line}: createOfficialRegistry(...).extend() — extend() returns void; assign the registry, then call extend`
      );
    }
    for (const fence of typescriptFences(text)) {
      if (fence.continues) {
        continue;
      }
      pasteable.push({ file: rel, line: fence.line, code: fence.code });
    }
  }

  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }

  const dist = join(root, 'packages/sdk/dist/index.d.ts');
  try {
    if (!statSync(dist).isFile()) {
      throw new Error('missing');
    }
  } catch {
    console.error('doc snippets need packages/sdk/dist. Run: pnpm --filter @erc7730/sdk build');
    process.exit(1);
  }

  if (pasteable.length === 0) {
    console.log('doc snippets ok (no pasteable fences)');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'erc7730-snippets-'));
  const files = pasteable.map((fence, index) => {
    const name = `snippet-${index}.ts`;
    writeFileSync(join(dir, name), fence.code);
    return name;
  });
  const sdkDist = join(root, 'packages/sdk/dist');
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
          typeRoots: [join(root, 'packages/sdk/node_modules/@types')],
          paths: {
            '@erc7730/sdk': [join(sdkDist, 'index.d.ts')],
            '@erc7730/sdk/*': [join(sdkDist, '*.d.ts')],
          },
        },
        files,
      },
      null,
      2
    )
  );

  const result = spawnSync(
    'pnpm',
    ['exec', 'tsc', '-p', join(dir, 'tsconfig.json'), '--noEmit', '--pretty', 'false'],
    {
      cwd: root,
      encoding: 'utf8',
    }
  );
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    console.error(mapSnippetErrors(output, pasteable, dir));
    rmSync(dir, { recursive: true, force: true });
    process.exit(result.status ?? 1);
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`doc snippets ok (${pasteable.length} pasteable fences)`);
}

/**
 * @param {string} output
 * @param {Array<{ file: string; line: number }>} pasteable
 * @param {string} dir
 */
function mapSnippetErrors(output, pasteable, dir) {
  return output
    .replace(/snippet-(\d+)\.ts\((\d+),(\d+)\)/g, (_all, index, line, col) => {
      const fence = pasteable[Number(index)];
      if (!fence) {
        return `snippet-${index}.ts(${line},${col})`;
      }
      const mapped = fence.line + Number(line) - 1;
      return `${fence.file}:${mapped}:${col}`;
    })
    .replaceAll(dir, '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
