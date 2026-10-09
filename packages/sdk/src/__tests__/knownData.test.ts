import { describe, expect, it } from 'vitest';
import { KNOWN_ADDRESSES, KNOWN_TOKENS, knownDataProvider } from '../known-data';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ROUTER = '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45';
const BASE_ROUTER = '0x2626664c2603336e57b271c5c0b26f421741e481';

describe('knownDataProvider', () => {
  it('resolves curated tokens and prefers the mainnet address label', async () => {
    const provider = knownDataProvider();
    await expect(provider.resolveToken?.(1, USDC)).resolves.toEqual({
      symbol: 'USDC',
      decimals: 6,
    });
    await expect(provider.resolveToken?.(1, ROUTER)).resolves.toBeNull();
    await expect(provider.resolveLocalName?.(ROUTER)).resolves.toBe('Uniswap V3 Router');
    await expect(provider.resolveLocalName?.(BASE_ROUTER)).resolves.toBe('Uniswap V3 Router');
    await expect(provider.resolveLocalName?.(USDC)).resolves.toBe('USDC');
    await expect(
      provider.resolveLocalName?.('0x0000000000000000000000000000000000000004')
    ).resolves.toBeNull();
    await expect(
      provider.resolveToken?.(1, '0x0000000000000000000000000000000000000004')
    ).resolves.toBeNull();
    expect(KNOWN_TOKENS[1]?.[USDC.toLowerCase()]?.decimals).toBe(6);
    expect(KNOWN_ADDRESSES[42161]?.[ROUTER.toLowerCase()]).toBe('Uniswap V3 Router 2');
  });
});
