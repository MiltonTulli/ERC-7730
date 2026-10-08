import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const outDir = join(here, '../src/content/docs');

const GITHUB_BLOB = 'https://github.com/MiltonTulli/ERC-7730/blob/main';

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

/** @type {Array<{ source: string; dest: string; title: string; description: string }>} */
const pages = [
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
    title: 'Protocol CI: ABI vs descriptor',
    description:
      'Optional CI snippet so an ABI change fails until the ERC-7730 descriptor is updated.',
  },
  {
    source: 'docs/divergences.md',
    dest: 'divergences.md',
    title: 'Divergences vs python-erc7730',
    description:
      'Justified differences between SDK resolveDescriptor and Ledger python-erc7730 resolve/lint.',
  },
];

/** @param {string} body */
function rewriteLinks(body) {
  return body
    .replaceAll('](./interop.md)', '](/ERC-7730/interop/)')
    .replaceAll('](./github-action.md)', '](/ERC-7730/action/)')
    .replaceAll('](./divergences.md)', '](/ERC-7730/divergences/)')
    .replaceAll('](./trust-table.md)', '](/ERC-7730/trust/)')
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
  const raw = await readFile(join(repoRoot, page.source), 'utf8');
  const body = rewriteLinks(stripLeadingH1(raw)).trimStart();
  const content = `---
# GENERATED FROM ${page.source} — do not edit; run pnpm --filter @erc7730/docs prepare:content
title: ${JSON.stringify(page.title)}
description: ${JSON.stringify(page.description)}
---

${body}
`;
  await writeFile(join(outDir, page.dest), content);
  console.log(`included ${page.source} → ${page.dest}`);
}

const trustTable = stripLeadingH1(
  await readFile(join(repoRoot, 'docs/trust-table.md'), 'utf8')
).trim();

const trustPage = `---
# GENERATED FROM docs/trust-table.md — do not edit; run prepare:content
title: Trust model
description: source × TrustPolicy × confidence — clear signing is not ABI pretty-printing.
---

Integrators must separate **trusted metadata** from **ABI guesses**. Shipping the latter as “clear signing” is false confidence.

## Source × policy × confidence

${trustTable}

## Production policies

\`\`\`ts
import { officialOnlyPolicy, composePolicies } from '@erc7730/sdk';
import { attestedPolicy } from '@erc7730/sdk/attest';

const pinOnly = officialOnlyPolicy();

const attested = attestedPolicy({
  attesters: ['0x3846c3A30E62075Fa916216b35EF04B8F53931f6'],
  eas: {
    call: async (chainId, { to, data }) => rpcEthCall(chainId, to, data),
  },
});

const pinOrAttested = composePolicies([pinOnly, attested], 'any');
\`\`\`

\`attestedPolicy\` **verifies** ERC-8176 attestations; the SDK never issues them. Without \`eas.call\` it fails closed (\`ATTESTATION_OPTIONS_INCOMPLETE\` / \`NO_TRUSTED_ATTESTATION\`).

| Recipe | Code |
| --- | --- |
| Pin only | \`trust: officialOnlyPolicy()\` |
| Pin + local \`extend()\` | \`trust: officialOrLocalPolicy()\` |
| ERC-8176 attesters | \`trust: attestedPolicy({ attesters, eas })\` |
| Pin **or** attested | \`composePolicies([officialOnlyPolicy(), attestedPolicy(...)], 'any')\` |
| Pin **and** attested | \`composePolicies([officialOnlyPolicy(), attestedPolicy(...)], 'all')\` |

\`trust.reasons\` are stable codes (\`source:official-registry:accepted\`, \`ATTESTED\`, …) — safe for telemetry. Prefer them over free-form sentences.

## Demo vs production

The [interactive demo](/ERC-7730/demo/) injects \`officialOrLocalPolicy()\` so local overrides and generate drafts are easy to explore. That is a **playground** default. Production wallets should pass \`officialOnlyPolicy()\` or \`attestedPolicy()\`.

## See also

- [Wallet guide](/ERC-7730/guide/) — format first, then pin + policy
- [Registry](/ERC-7730/registry/) — commit SHA pins and indexes
- [What we are not](/ERC-7730/not-this/)
`;

await writeFile(join(outDir, 'trust.md'), trustPage);
console.log('included docs/trust-table.md → trust.md');
