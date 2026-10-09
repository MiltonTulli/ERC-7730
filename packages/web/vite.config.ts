import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Docs site mounts the playground at /ERC-7730/demo/ on GitHub Pages.
  base: process.env.GITHUB_ACTIONS || process.env.ERC7730_DOCS_SITE ? '/ERC-7730/demo/' : '/',
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable sourcemaps for smaller build
  },
  resolve: {
    alias: [
      {
        find: /^@erc7730\/sdk\/generate$/,
        replacement: resolve(__dirname, '../sdk/dist/generate.js'),
      },
      {
        find: /^@erc7730\/sdk\/sourcify$/,
        replacement: resolve(__dirname, '../sdk/dist/sourcify.js'),
      },
      {
        find: /^@erc7730\/sdk\/known-data$/,
        replacement: resolve(__dirname, '../sdk/dist/known-data.js'),
      },
      {
        find: /^@erc7730\/sdk\/attest$/,
        replacement: resolve(__dirname, '../sdk/dist/attest.js'),
      },
      { find: /^@erc7730\/sdk$/, replacement: resolve(__dirname, '../sdk/dist/index.js') },
    ],
  },
});
