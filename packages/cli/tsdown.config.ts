import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: 'esm',
  dts: false,
  platform: 'node',
  // platform node defaults fixedExtension, which emits .mjs. The bin is dist/index.js.
  fixedExtension: false,
  target: 'node18',
  sourcemap: false,
  clean: true,
});
