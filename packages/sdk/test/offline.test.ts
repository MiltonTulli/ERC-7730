import { describe, expect, it } from 'vitest';

describe('offline unit suite', () => {
  it('refuses network access unless ERC7730_LIVE=1', async () => {
    expect(() => fetch('https://example.invalid/erc7730')).toThrow(/block network access/);
  });
});
