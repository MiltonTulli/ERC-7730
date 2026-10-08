import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    attest: 'src/attest.ts',
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
});
