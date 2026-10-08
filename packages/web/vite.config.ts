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
    alias: {
      '@erc7730/sdk': resolve(__dirname, '../sdk/dist/index.js'),
    },
  },
});
