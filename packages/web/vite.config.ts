import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Use repo name for GitHub Pages (https://miltontulli.github.io/ERC-7730/)
  base: process.env.GITHUB_ACTIONS ? '/ERC-7730/' : '/',
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable sourcemaps for smaller build
  },
  resolve: {
    alias: {
      '@erc7730/sdk': resolve(__dirname, '../sdk/src'),
    },
  },
});
