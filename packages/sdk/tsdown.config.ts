import { defineConfig } from 'tsdown';
import { stripSchemaAnnotations } from './scripts/strip-schema-annotations.mjs';

// Groups apply to JS only. Declaration chunks keep default names for the API report.
const sourceIn = (dir: string) => {
  const pattern = new RegExp(`[/\\\\]src[/\\\\]${dir}[/\\\\]`);
  return (id: string) => pattern.test(id) && !id.endsWith('.d.ts');
};

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    attest: 'src/attest.ts',
    generate: 'src/generate/index.ts',
    sourcify: 'src/sourcify.ts',
    'known-data': 'src/known-data.ts',
    legacy: 'src/legacy.ts',
  },
  format: 'esm',
  dts: true,
  platform: 'neutral',
  target: 'node18',
  sourcemap: false,
  clean: true,
  // `@erc7730/sdk/attest` imports viem. Keep it external so the root graph does not ship it.
  deps: {
    neverBundle: [/^viem(?:\/|$)/],
  },
  plugins: [
    {
      name: 'erc7730:strip-schema-annotations',
      transform: {
        filter: { id: /[\\/]schema[\\/]official[\\/][^\\/]+\.schema\.json$/ },
        handler(code) {
          return { code: JSON.stringify(stripSchemaAnnotations(JSON.parse(code))) };
        },
      },
    },
  ],
  outputOptions: {
    // Shared code is split by area so no published chunk grows past the bundle check limit.
    codeSplitting: {
      groups: [
        { name: 'schema', test: sourceIn('schema'), priority: 2, entriesAware: true },
        {
          name: 'decode',
          test: sourceIn('decode'),
          priority: 1,
          entriesAware: true,
          maxSize: 90_000,
        },
      ],
    },
  },
});
