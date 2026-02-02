/**
 * ERC-7730 descriptor for ERC-721 NFTs
 */

import type { ERC7730Descriptor } from '../types/erc7730.js';

export const ERC721_DESCRIPTOR: ERC7730Descriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v1.schema.json',
  context: {
    $id: 'ERC721',
    contract: {
      deployments: [],
    },
  },
  metadata: {
    owner: 'ERC-721 Standard',
    info: {
      url: 'https://eips.ethereum.org/EIPS/eip-721',
    },
  },
  display: {
    formats: {
      'safeTransferFrom(address,address,uint256)': {
        intent: 'Transfer NFT',
        fields: [
          {
            path: 'from',
            label: 'From',
            format: 'addressName',
          },
          {
            path: 'to',
            label: 'To',
            format: 'addressName',
          },
          {
            path: 'tokenId',
            label: 'Token ID',
            format: 'raw',
          },
        ],
      },
      'safeTransferFrom(address,address,uint256,bytes)': {
        intent: 'Transfer NFT (with data)',
        fields: [
          {
            path: 'from',
            label: 'From',
            format: 'addressName',
          },
          {
            path: 'to',
            label: 'To',
            format: 'addressName',
          },
          {
            path: 'tokenId',
            label: 'Token ID',
            format: 'raw',
          },
        ],
      },
      'transferFrom(address,address,uint256)': {
        intent: 'Transfer NFT (unsafe)',
        fields: [
          {
            path: 'from',
            label: 'From',
            format: 'addressName',
          },
          {
            path: 'to',
            label: 'To',
            format: 'addressName',
          },
          {
            path: 'tokenId',
            label: 'Token ID',
            format: 'raw',
          },
        ],
      },
      // Note: approve(address,uint256) has same signature as ERC20
      // ERC20 is prioritized by default. For NFT-specific approve,
      // use contract address matching or custom descriptors.
      'approve(address,uint256)': {
        intent: 'Approve NFT transfer',
        fields: [
          {
            path: 'spender', // Use same name as ERC20 for compatibility
            label: 'Approved Address',
            format: 'addressName',
          },
          {
            path: 'amount', // In ERC721 context this is tokenId
            label: 'Token ID',
            format: 'raw',
          },
        ],
      },
      'setApprovalForAll(address,bool)': {
        intent: 'Set approval for all NFTs',
        fields: [
          {
            path: 'operator',
            label: 'Operator',
            format: 'addressName',
          },
          {
            path: 'approved',
            label: 'Approved',
            format: 'raw',
          },
        ],
      },
    },
  },
};
