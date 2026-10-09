/**
 * Curated token metadata and contract names.
 *
 * The decode core does not read these tables. Pass `knownDataProvider()` as
 * `DecodeOptions.externalDataProvider` when a wallet wants them.
 * Names have no registry provenance and are not a trust signal.
 */

import type { Address, ExternalDataProvider } from './decode/types';

/** chainId → lowercase address → display name. */
export const KNOWN_ADDRESSES: Record<number, Record<string, string>> = {
  1: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
    '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router',
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router (Old)',
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router',
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
    '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave V3 Pool',
    '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9': 'Aave V2 Pool',
    '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch Router V5',
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
    '0x881d40237659c251811cec9c364ef91dc08d300c': 'MetaMask Swap Router',
    '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': 'OpenSea Seaport',
    '0x00000000006c3852cbef3e08e8df289169ede581': 'OpenSea Seaport 1.1',
    '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85': 'ENS Registrar',
    '0x253553366da8546fc250f225fe3d25d0c782303b': 'ENS ETH Registrar Controller',
    '0xd9db270c1b5e3bd161e8c8503c55ceabee709552': 'Gnosis Safe Singleton',
    '0xa6b71e26c5e0845f74c812102ca7114b6a896ab2': 'Gnosis Safe Proxy Factory',
  },
  42161: {
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router 2',
    '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch Router V5',
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'Aave V3 Pool',
  },
  10: {
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router 2',
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'Aave V3 Pool',
  },
  8453: {
    '0x2626664c2603336e57b271c5c0b26f421741e481': 'Uniswap V3 Router',
    '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
  },
  137: {
    '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router 2',
    '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch Router V5',
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'Aave V3 Pool',
  },
};

/** chainId → lowercase address → symbol and decimals. */
export const KNOWN_TOKENS: Record<number, Record<string, { symbol: string; decimals: number }>> = {
  1: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
    '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
    '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18 },
    '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18 },
    '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18 },
    '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': { symbol: 'SHIB', decimals: 18 },
    '0x4d224452801aced8b2f0aebe155379bb5d594381': { symbol: 'APE', decimals: 18 },
  },
  42161: {
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', decimals: 6 },
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', decimals: 6 },
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', decimals: 18 },
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { symbol: 'WETH', decimals: 18 },
  },
  10: {
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { symbol: 'USDC', decimals: 6 },
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { symbol: 'USDT', decimals: 6 },
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', decimals: 18 },
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  },
  8453: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  },
  137: {
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': { symbol: 'USDC.e', decimals: 6 },
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6 },
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', decimals: 6 },
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI', decimals: 18 },
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', decimals: 18 },
  },
};

/**
 * `resolveLocalName` has no chain id. Mainnet wins when the same address
 * has a different label on another chain. Otherwise the first listed chain wins.
 */
function lookupKnownAddress(address: string): string | null {
  const normalized = address.toLowerCase();
  const mainnet = KNOWN_ADDRESSES[1]?.[normalized];
  if (mainnet) {
    return mainnet;
  }
  for (const byAddress of Object.values(KNOWN_ADDRESSES)) {
    const name = byAddress[normalized];
    if (name) {
      return name;
    }
  }
  return null;
}

/** Opt-in curated names. The decode core does not call this. */
export function knownDataProvider(): ExternalDataProvider {
  return {
    async resolveToken(chainId: number, address: Address) {
      const info = KNOWN_TOKENS[chainId]?.[address.toLowerCase()];
      return info ? { symbol: info.symbol, decimals: info.decimals } : null;
    },
    async resolveLocalName(address: Address) {
      return lookupKnownAddress(address);
    },
  };
}
