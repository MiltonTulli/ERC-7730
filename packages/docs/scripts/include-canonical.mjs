import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const outDir = join(here, '../src/content/docs');

const GITHUB_BLOB = 'https://github.com/MiltonTulli/ERC-7730/blob/main';
const GITHUB_TREE = 'https://github.com/MiltonTulli/ERC-7730/tree/main';

/** HTML comments break MDX. JSX comments would show on GitHub-flavored READMEs. */
const quickstartTargets = [
  { rel: 'README.md', comment: 'html' },
  { rel: 'packages/sdk/README.md', comment: 'html' },
  { rel: 'docs/GUIDE.md', comment: 'html' },
  { rel: 'packages/docs/src/content/docs/index.mdx', comment: 'mdx' },
  { rel: 'packages/docs/src/content/docs/sdk.mdx', comment: 'mdx' },
];

const quickstartSource = (
  await readFile(join(repoRoot, 'docs/snippets/quickstart.ts'), 'utf8')
).replace(/\s+$/, '');

/**
 * @param {'html' | 'mdx'} comment
 */
function quickstartBlock(comment) {
  const open = comment === 'mdx' ? '{/* quickstart:start */}' : '<!-- quickstart:start -->';
  const close = comment === 'mdx' ? '{/* quickstart:end */}' : '<!-- quickstart:end -->';
  return `${open}\n\`\`\`ts\n${quickstartSource}\n\`\`\`\n${close}`;
}

/**
 * @param {'html' | 'mdx'} comment
 */
function quickstartPattern(comment) {
  return comment === 'mdx'
    ? /{\/\* quickstart:start \*\/}[\s\S]*?{\/\* quickstart:end \*\/}/
    : /<!-- quickstart:start -->[\s\S]*?<!-- quickstart:end -->/;
}

let quickstartDrift = false;
for (const target of quickstartTargets) {
  const path = join(repoRoot, target.rel);
  const raw = await readFile(path, 'utf8');
  const pattern = quickstartPattern(target.comment);
  if (!pattern.test(raw)) {
    console.error(`missing quickstart markers in ${target.rel}`);
    process.exit(1);
  }
  const next = raw.replace(pattern, quickstartBlock(target.comment));
  if (next !== raw) {
    await writeFile(path, next);
    console.error(`quickstart drift in ${target.rel}; rewritten from docs/snippets/quickstart.ts`);
    quickstartDrift = true;
  } else {
    console.log(`quickstart ok ${target.rel}`);
  }
}
if (quickstartDrift) {
  process.exit(1);
}

// Keep the support policy identical on GitHub, npm, and the site's entry pages.
const guide = await readFile(join(repoRoot, 'docs/GUIDE.md'), 'utf8');
const support = guide.match(
  /<!-- runtime-support:start -->\n([\s\S]*?)\n<!-- runtime-support:end -->/
);
if (!support) {
  throw new Error('Missing runtime-support markers in docs/GUIDE.md');
}
let supportDrift = false;
for (const target of quickstartTargets.filter((target) => target.rel !== 'docs/GUIDE.md')) {
  const path = join(repoRoot, target.rel);
  const raw = await readFile(path, 'utf8');
  const pattern =
    target.comment === 'mdx'
      ? /{\/\* runtime-support:start \*\/}[\s\S]*?{\/\* runtime-support:end \*\/}/
      : /<!-- runtime-support:start -->[\s\S]*?<!-- runtime-support:end -->/;
  if (!pattern.test(raw)) {
    throw new Error(`Missing runtime-support markers in ${target.rel}`);
  }
  const open =
    target.comment === 'mdx' ? '{/* runtime-support:start */}' : '<!-- runtime-support:start -->';
  const close =
    target.comment === 'mdx' ? '{/* runtime-support:end */}' : '<!-- runtime-support:end -->';
  const next = raw.replace(pattern, `${open}\n${support[1]}\n${close}`);
  if (next !== raw) {
    await writeFile(path, next);
    console.error(`runtime support drift in ${target.rel}; rewritten from docs/GUIDE.md`);
    supportDrift = true;
  }
}
if (supportDrift) {
  process.exit(1);
}

/** @type {Array<{ source: string; dest: string; title: string; description: string }>} */
const pages = [
  {
    source: 'docs/design-decisions.md',
    dest: 'design-decisions.md',
    title: 'Design decisions',
    description: 'Registry pins, trust boundaries, enrichment, and scope for wallet integrators.',
  },
  {
    source: 'docs/support-policy.md',
    dest: 'support-policy.md',
    title: 'Support policy',
    description: 'Semver, deprecations, maintained release lines, runtimes, and security response.',
  },
  {
    source: 'docs/runtime-compatibility.md',
    dest: 'sdk/compatibility.md',
    title: 'Runtime compatibility',
    description:
      'ESM consumer checks, supported Node versions, and the CJS / React Native decision.',
  },
  {
    source: 'docs/migrating-to-1.0.md',
    dest: 'sdk/migrating-to-1-0.md',
    title: 'Migrating to 1.0',
    description: 'Removed 0.12 symbols and their 1.0 replacements, generated from API reports.',
  },
  {
    source: 'docs/GUIDE.md',
    dest: 'guide.md',
    title: 'Wallet integration guide',
    description:
      'Wire @erc7730/sdk into a wallet: quick start, production pin and TrustPolicy, prefetch, ExternalDataProvider, batch, and UserOp.',
  },
  {
    source: 'docs/interop.md',
    dest: 'interop.md',
    title: 'Interop matrix',
    description: 'How @erc7730/sdk compares to Ledger python-erc7730 and Sourcify clear-signing.',
  },
  {
    source: 'docs/github-action.md',
    dest: 'action.md',
    title: 'Protocol CI',
    description:
      'ABI fingerprint check, and erc7730 test with screens in the GitHub Actions job summary.',
  },
  {
    source: 'docs/divergences.md',
    dest: 'divergences.md',
    title: 'Divergences vs python-erc7730',
    description:
      'Justified differences between SDK resolveDescriptor and Ledger python-erc7730 resolve/lint.',
  },
  {
    source: 'docs/diagnostics.md',
    dest: 'diagnostics.md',
    title: "Why didn't my transaction decode?",
    description: 'Diagnostic codes for registry, context, format, include, and trust.',
  },
  {
    source: 'docs/rendering.md',
    dest: 'rendering.md',
    title: 'Rendering a confirmation screen',
    description: 'toScreens() and a short React and vanilla example.',
  },
  {
    source: 'docs/observability.md',
    dest: 'observability.md',
    title: 'Observability',
    description: 'Per-call onEvent counters for registry, trust, and decode latency.',
  },
  {
    source: 'docs/case-studies/ambire.md',
    dest: 'case-studies/ambire.md',
    title: 'Case study: Ambire confirmation screen',
    description: 'Twenty wallet calls scored with clearSign against the vendored registry pin.',
  },
];

/** @param {string} body */
function rewriteLinks(body) {
  return body
    .replaceAll('](./GUIDE.md', '](/ERC-7730/guide/')
    .replaceAll('](./design-decisions.md', '](/ERC-7730/design-decisions/')
    .replaceAll('](./support-policy.md', '](/ERC-7730/support-policy/')
    .replaceAll('](./runtime-compatibility.md)', '](/ERC-7730/sdk/compatibility/)')
    .replaceAll('](./case-studies/ambire.md)', '](/ERC-7730/case-studies/ambire/)')
    .replaceAll('](../SECURITY.md)', `](${GITHUB_BLOB}/SECURITY.md)`)
    .replaceAll('](../RELEASE.md)', `](${GITHUB_BLOB}/RELEASE.md)`)
    .replaceAll('](./migrating-to-1.0.md)', '](/ERC-7730/sdk/migrating-to-1-0/)')
    .replaceAll('](../packages/sdk/CHANGELOG.md)', `](${GITHUB_BLOB}/packages/sdk/CHANGELOG.md)`)
    .replaceAll('](../api/baselines/0.12.0)', `](${GITHUB_TREE}/api/baselines/0.12.0)`)
    .replaceAll('](../api)', `](${GITHUB_TREE}/api)`)
    .replaceAll('](./interop.md)', '](/ERC-7730/interop/)')
    .replaceAll('](./github-action.md)', '](/ERC-7730/action/)')
    .replaceAll('](./divergences.md)', '](/ERC-7730/divergences/)')
    .replaceAll('](./diagnostics.md)', '](/ERC-7730/diagnostics/)')
    .replaceAll('](./rendering.md)', '](/ERC-7730/rendering/)')
    .replaceAll('](./observability.md)', '](/ERC-7730/observability/)')
    .replaceAll('](./trust-table.md', '](/ERC-7730/trust/')
    .replaceAll('](../README.md)', `](${GITHUB_BLOB}/README.md)`)
    .replaceAll('](../ROADMAP.md)', `](${GITHUB_BLOB}/ROADMAP.md)`);
}

/**
 * Strip a leading ATX H1 so Starlight's title is not duplicated.
 * @param {string} body
 */
function stripLeadingH1(body) {
  return body.replace(/^#\s+[^\n]+\n+/, '');
}

await mkdir(outDir, { recursive: true });

for (const page of pages) {
  const destPath = join(outDir, page.dest);
  await mkdir(dirname(destPath), { recursive: true });
  const raw = await readFile(join(repoRoot, page.source), 'utf8');
  const body = rewriteLinks(stripLeadingH1(raw)).trimStart();
  const content = `---
# GENERATED FROM ${page.source} — do not edit; run pnpm --filter @erc7730/docs prepare:content
title: ${JSON.stringify(page.title)}
description: ${JSON.stringify(page.description)}
---

${body}
`;
  await writeFile(destPath, content);
  console.log(`included ${page.source} → ${page.dest}`);
}

const trustTable = stripLeadingH1(
  rewriteLinks(await readFile(join(repoRoot, 'docs/trust-table.md'), 'utf8'))
).trim();

const trustPage = `---
# GENERATED FROM docs/trust-table.md — do not edit; run prepare:content
title: Trust model
description: Provenance, policy acceptance, confidence, and screen verification for wallet integrators.
---

${trustTable}

## See also

- [Wallet guide](/ERC-7730/guide/) — format first, then pin + policy
- [Registry](/ERC-7730/registry/) — commit SHA pins and indexes
- [Design decisions](/ERC-7730/design-decisions/)
- [Support policy](/ERC-7730/support-policy/)
`;

await writeFile(join(outDir, 'trust.md'), trustPage);
console.log('included docs/trust-table.md → trust.md');
