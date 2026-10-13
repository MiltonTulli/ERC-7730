import { bench, describe } from 'vitest';
import {
  DECODE_OPTIONS,
  FORMAT_COUNT,
  TRANSFER_100_USDC,
  USDC,
  descriptorWithFormats,
  fixedRegistry,
} from '../../../scripts/sdk-perf-fixtures.mjs';
import { decodeTransaction } from '../src/decode/decodeTransaction';
import { resolveDescriptor } from '../src/resolve';

const tx = { to: USDC, data: TRANSFER_100_USDC, chainId: 1 } as const;
const single = {
  ...DECODE_OPTIONS,
  registry: fixedRegistry(await resolveDescriptor(descriptorWithFormats(1))),
};
const many = {
  ...DECODE_OPTIONS,
  registry: fixedRegistry(await resolveDescriptor(descriptorWithFormats(FORMAT_COUNT))),
};

describe('decodeTransaction', () => {
  bench('cached descriptor', async () => {
    await decodeTransaction(tx, single);
  });

  bench(`${FORMAT_COUNT} formats`, async () => {
    await decodeTransaction(tx, many);
  });
});
