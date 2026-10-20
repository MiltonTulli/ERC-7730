import type { TransactionInput } from '@erc7730/sdk';

export const fixtures = {
  verified: {
    to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    data: '0xd0e30db0',
    value: '1000000000000000000',
    chainId: 1,
  },
  fallback: {
    to: '0x1111111111111111111111111111111111111111',
    data: `0x095ea7b3${'2'.repeat(40).padStart(64, '0')}${'f'.repeat(64)}`,
    value: '0',
    chainId: 1,
  },
  malformed: {
    to: '0x1234',
    data: '0xd0e30db0',
    value: '0',
    chainId: 1,
  },
} satisfies Record<string, TransactionInput>;
