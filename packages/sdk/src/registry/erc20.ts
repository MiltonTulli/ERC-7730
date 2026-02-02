/**
 * ERC-7730 descriptor for ERC-20 tokens
 */

import type { ERC7730Descriptor } from '../types/erc7730.js';

export const ERC20_DESCRIPTOR: ERC7730Descriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v1.schema.json',
  context: {
    $id: 'ERC20',
    contract: {
      // ERC20 applies to any contract implementing these functions
      deployments: [], // Empty = matches by function signature
    },
  },
  metadata: {
    owner: 'ERC-20 Standard',
    info: {
      url: 'https://eips.ethereum.org/EIPS/eip-20',
    },
  },
  display: {
    formats: {
      'transfer(address,uint256)': {
        intent: 'Send tokens',
        fields: [
          {
            path: 'to',
            label: 'Recipient',
            format: 'addressName',
          },
          {
            path: 'amount',
            label: 'Amount',
            format: 'tokenAmount',
          },
        ],
      },
      'approve(address,uint256)': {
        intent: 'Approve spending',
        fields: [
          {
            path: 'spender',
            label: 'Spender',
            format: 'addressName',
          },
          {
            path: 'amount',
            label: 'Amount',
            format: 'tokenAmount',
          },
        ],
      },
      'transferFrom(address,address,uint256)': {
        intent: 'Transfer tokens (on behalf)',
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
            path: 'amount',
            label: 'Amount',
            format: 'tokenAmount',
          },
        ],
      },
      'increaseAllowance(address,uint256)': {
        intent: 'Increase allowance',
        fields: [
          {
            path: 'spender',
            label: 'Spender',
            format: 'addressName',
          },
          {
            path: 'addedValue',
            label: 'Additional Amount',
            format: 'tokenAmount',
          },
        ],
      },
      'decreaseAllowance(address,uint256)': {
        intent: 'Decrease allowance',
        fields: [
          {
            path: 'spender',
            label: 'Spender',
            format: 'addressName',
          },
          {
            path: 'subtractedValue',
            label: 'Reduced Amount',
            format: 'tokenAmount',
          },
        ],
      },
    },
  },
};
