import { fileURLToPath } from 'node:url';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

const sdkRoot = fileURLToPath(new URL('../sdk', import.meta.url));

export default defineConfig({
  site: 'https://miltontulli.github.io',
  base: '/ERC-7730',
  vite: {
    server: {
      fs: {
        allow: [fileURLToPath(new URL('../..', import.meta.url))],
      },
    },
  },
  integrations: [
    starlight({
      title: 'ERC-7730 toolkit',
      description:
        'TypeScript runtime (@erc7730/sdk) and authoring CLI (@erc7730/cli) for ERC-7730 clear signing.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/MiltonTulli/ERC-7730',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/MiltonTulli/ERC-7730/edit/main/packages/docs/',
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      plugins: [
        starlightTypeDoc({
          entryPoints: [
            `${sdkRoot}/src/index.ts`,
            `${sdkRoot}/src/attest.ts`,
            `${sdkRoot}/src/generate/index.ts`,
            `${sdkRoot}/src/sourcify.ts`,
            `${sdkRoot}/src/known-data.ts`,
          ],
          tsconfig: `${sdkRoot}/tsconfig.json`,
          output: 'sdk/api',
          sidebar: {
            label: 'SDK API',
            collapsed: true,
          },
          typeDoc: {
            excludeInternal: true,
            excludePrivate: true,
            excludeProtected: true,
            readme: 'none',
            githubPages: false,
            entryPointStrategy: 'resolve',
            entryFileName: 'index.md',
          },
        }),
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Home', link: '/' },
            { slug: 'guide' },
            { slug: 'trust' },
            { slug: 'registry' },
            { slug: 'not-this' },
            {
              label: 'Security',
              link: 'https://github.com/MiltonTulli/ERC-7730/blob/main/SECURITY.md',
            },
          ],
        },
        {
          label: 'SDK',
          items: [
            { slug: 'sdk' },
            { slug: 'sdk/decode' },
            { slug: 'diagnostics' },
            { slug: 'rendering' },
            { slug: 'observability' },
            { slug: 'sdk/validate-resolve' },
            { slug: 'sdk/viem' },
          ],
        },
        typeDocSidebarGroup,
        {
          label: 'CLI',
          items: [{ slug: 'cli' }, { slug: 'cli/generate' }, { slug: 'cli/walkthrough' }],
        },
        {
          label: 'Interop',
          items: [{ slug: 'interop' }, { slug: 'action' }, { slug: 'divergences' }],
        },
        {
          label: 'Case studies',
          items: [{ slug: 'case-studies/ambire' }],
        },
        {
          label: 'Playground',
          items: [
            {
              label: 'Interactive demo',
              link: '/demo/',
              attrs: { target: '_self' },
            },
          ],
        },
      ],
    }),
  ],
});
