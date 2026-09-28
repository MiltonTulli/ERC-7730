import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cliSrc = join(here, '../../cli/src');
const outFile = join(here, '../src/content/docs/cli/generate.md');
const cliPkg = JSON.parse(await readFile(join(here, '../../cli/package.json'), 'utf8'));

const helpSource = await readFile(join(cliSrc, 'help.ts'), 'utf8');
const previewSource = await readFile(join(cliSrc, 'preview.ts'), 'utf8');

/**
 * @param {string} name
 * @param {string} source
 */
function extractHelp(name, source) {
  const re = new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`Missing export ${name} in help.ts`);
  }
  return match[1].trim();
}

const helps = {
  ROOT: extractHelp('ROOT_HELP', helpSource),
  GENERATE: extractHelp('GENERATE_HELP', helpSource),
  LINT: extractHelp('LINT_HELP', helpSource),
  PREVIEW: extractHelp('PREVIEW_HELP', helpSource),
  SCAFFOLD: extractHelp('SCAFFOLD_HELP', helpSource),
  DIFF: extractHelp('DIFF_HELP', helpSource),
  REGISTRY: extractHelp('REGISTRY_HELP', helpSource),
};

const previewHasSourcify = /sourcify:\s*\{\s*type:\s*'boolean'\s*\}/.test(previewSource);
if (!previewHasSourcify) {
  throw new Error('preview.ts no longer declares --sourcify; update the docs generator');
}

/** Flags documented for anti-drift tests (help text + known parseArgs extras). */
const documentedFlags = [
  '--chain-id',
  '--address',
  '--abi',
  '--owner',
  '--url',
  '--out',
  '--json',
  '--tests',
  '--data',
  '--to',
  '--from',
  '--value',
  '--pin',
  '--registry-path',
  '--sourcify',
  '--against',
  '--cache-dir',
  '--force',
  '--help',
  '--version',
];

const content = `---
# GENERATED FROM packages/cli/src/help.ts — do not edit; run prepare:content
title: CLI command reference
description: Flags and help text for the published erc7730 binary (@erc7730/cli).
---

This page is generated from \`packages/cli/src/help.ts\` for **\`@erc7730/cli@${cliPkg.version}\`**. The public surface is the \`erc7730\` binary only — do not import the package.

\`\`\`bash
npm install -D @erc7730/cli
erc7730 --help
erc7730 <command> --help
\`\`\`

## Root

\`\`\`text
${helps.ROOT}
\`\`\`

## generate

\`\`\`text
${helps.GENERATE}
\`\`\`

## lint

\`\`\`text
${helps.LINT}
\`\`\`

## preview

\`\`\`text
${helps.PREVIEW}
\`\`\`

${
  helps.PREVIEW.includes('--sourcify')
    ? ''
    : `:::note
\`preview\` also accepts \`--sourcify\` (opt-in untrusted Sourcify / generated fallback). Prefer updating \`PREVIEW_HELP\` so \`erc7730 preview --help\` matches this page.
:::
`
}

Negative \`--value\` must be passed as \`--value=-1\`. A separate argv token \`-1\` is parsed as another flag.

## scaffold

\`\`\`text
${helps.SCAFFOLD}
\`\`\`

## diff

\`\`\`text
${helps.DIFF}
\`\`\`

## registry update

\`\`\`text
${helps.REGISTRY}
\`\`\`

## Environment

| Variable | Meaning |
| --- | --- |
| \`ERC7730_REGISTRY_PATH\` | Local checkout of the official registry (GitHub tree layout). Read-side only |
| \`ERC7730_REGISTRY_PIN\` | Default 40-character commit SHA pin |
| \`ERC7730_CACHE_DIR\` | Cache root (default \`~/.erc7730\`). \`registry update\` writes under this directory |

Floating branch names (\`master\`, \`main\`) are not pins.

## Exit codes

| Code | When |
| --- | --- |
| 0 | Success. Also \`--help\` and \`--version\` |
| 1 | Usage error, unknown command, \`lint\` error-level issue, \`generate\` draft that fails v2 validation, \`diff\` mismatch / miss, \`registry\` without \`update\` |

\`lint\` warnings do not fail the process. With no arguments, \`erc7730\` prints help and exits \`1\`.

<!-- flags:${documentedFlags.join(',')} -->
`;

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, content);
console.log(`wrote ${outFile}`);
