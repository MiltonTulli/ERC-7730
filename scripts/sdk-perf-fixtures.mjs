/** Shared inputs for `check-sdk-perf.mjs` and the SDK `vitest bench` suite. */
export const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const VITALIK = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
export const TRANSFER_100_USDC = `0xa9059cbb000000000000000000000000${VITALIK}0000000000000000000000000000000000000000000000000000000005f5e100`;

export const FORMAT_COUNT = 50;

/** USDC-like descriptor with `transfer` plus `FORMAT_COUNT - 1` filler formats declared first. */
export function descriptorWithFormats(count = 1) {
  const formats = {};
  for (let i = 0; i < count - 1; i++) {
    formats[`filler${i}(uint256 amount)`] = {
      intent: `Filler ${i}`,
      fields: [{ path: 'amount', label: 'Amount', format: 'raw' }],
    };
  }
  formats['transfer(address to,uint256 value)'] = {
    intent: 'Send',
    interpolatedIntent: 'Send {value} to {to}',
    fields: [
      { path: 'to', label: 'Recipient', format: 'addressName' },
      { path: 'value', label: 'Amount', format: 'tokenAmount', params: { tokenPath: '@.to' } },
    ],
  };
  return {
    $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
    context: { $id: 'USD Coin', contract: { deployments: [{ chainId: 1, address: USDC }] } },
    metadata: {
      owner: 'Centre',
      contractName: 'USD Coin',
      token: { name: 'USD Coin', ticker: 'USDC', decimals: 6 },
    },
    display: { formats },
  };
}

/** Registry that always returns `resolved`, so decode cost excludes descriptor loading. */
export function fixedRegistry(resolved) {
  return {
    async findCalldata() {
      return resolved;
    },
  };
}

export const DECODE_OPTIONS = { provider: null, useSourcifyFallback: false };
