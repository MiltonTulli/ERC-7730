/**
 * The unit suite stays offline. The pinned registry lookup sets ERC7730_LIVE=1.
 */
const live = process.env.ERC7730_LIVE === '1';

if (!live) {
  const blocked = (): never => {
    throw new Error(
      'Unit tests block network access. Set ERC7730_LIVE=1 to run the live registry lookup.'
    );
  };
  globalThis.fetch = blocked as typeof fetch;
}
