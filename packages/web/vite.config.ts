import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './', // For GitHub Pages compatibility
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@erc7730/sdk': resolve(__dirname, '../sdk/src'),
    },
  },
});
