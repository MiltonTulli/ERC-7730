/**
 * ERC-7730 descriptor for WETH (Wrapped Ether)
 */

import type { ERC7730Descriptor } from '../types/erc7730.js';

export const WETH_DESCRIPTOR: ERC7730Descriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v1.schema.json',
  context: {
    $id: 'WETH',
    contract: {
      deployments: [
        // Ethereum Mainnet
        { chainId: 1, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
        // Arbitrum
        { chainId: 42161, address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
        // Optimism
        { chainId: 10, address: '0x4200000000000000000000000000000000000006' },
        // Base
        { chainId: 8453, address: '0x4200000000000000000000000000000000000006' },
        // Polygon
        { chainId: 137, address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' },
      ],
    },
  },
  metadata: {
    owner: 'WETH',
    info: {
      url: 'https://weth.io',
    },
  },
  display: {
    formats: {
      'deposit()': {
        intent: 'Wrap ETH',
        fields: [],
      },
      'withdraw(uint256)': {
        intent: 'Unwrap ETH',
        fields: [
          {
            path: 'wad',
            label: 'Amount',
            format: 'tokenAmount',
            params: {
              tokenPath: '@.to',
            },
          },
        ],
      },
    },
  },
};
