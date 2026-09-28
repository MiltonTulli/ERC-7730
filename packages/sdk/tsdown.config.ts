import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    lite: 'src/lite.ts',
    viem: 'src/viem.ts',
  },
  format: 'esm',
  dts: true,
  platform: 'neutral',
  target: 'node18',
  sourcemap: false,
  clean: true,
});
