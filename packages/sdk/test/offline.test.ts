import { describe, expect, it } from 'vitest';

describe('offline unit suite', () => {
  it.skipIf(process.env.ERC7730_LIVE === '1')(
    'refuses network access unless ERC7730_LIVE=1',
    () => {
      expect(() => fetch('https://example.invalid/erc7730')).toThrow(/block network access/);
    }
  );
});
