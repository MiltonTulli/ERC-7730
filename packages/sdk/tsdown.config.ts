import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: 'esm',
  dts: true,
  platform: 'neutral',
  target: 'node18',
  sourcemap: false,
  clean: true,
  // viem is required at runtime. Keep the package and its subpaths external so
  // a consumer bundler still sees viem/utils and viem/chains.
  deps: {
    neverBundle: [/^viem(?:\/|$)/],
  },
});
