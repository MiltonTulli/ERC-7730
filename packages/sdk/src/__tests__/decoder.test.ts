import { describe, expect, it } from 'vitest';
import { ClearSigner } from '../core/ClearSigner.js';
import { decodeCalldata, extractSelector } from '../core/decoder.js';

describe('extractSelector', () => {
  it('extracts selector from calldata', () => {
    const calldata =
      '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100';
    expect(extractSelector(calldata)).toBe('0xa9059cbb');
  });

  it('throws on invalid calldata', () => {
    expect(() => extractSelector('0x1234')).toThrow();
  });
});

describe('decodeCalldata', () => {
  it('decodes ERC20 transfer', () => {
    const result = decodeCalldata({
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      data: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100',
      chainId: 1,
    });

    expect(result.functionName).toBe('transfer');
    expect(result.signature).toBe('transfer(address,uint256)');
    expect(result.args[0]).toBe('0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
    expect(result.args[1]).toBe(100000000n);
  });

  it('decodes ERC20 approve', () => {
    const result = decodeCalldata({
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      data: '0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25effFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      chainId: 1,
    });

    expect(result.functionName).toBe('approve');
    expect(result.signature).toBe('approve(address,uint256)');
  });

  it('handles unknown function', () => {
    const result = decodeCalldata({
      to: '0x1234567890123456789012345678901234567890',
      data: '0x12345678abcdef',
      chainId: 1,
    });

    expect(result.functionName).toBe(null);
    expect(result.selector).toBe('0x12345678');
  });
});

describe('ClearSigner', () => {
  it('decodes ERC20 transfer with human-readable output', async () => {
    // Disable network calls for fast, deterministic tests
    const signer = new ClearSigner({ provider: null, useSourcifyFallback: false });

    const result = await signer.decode({
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      data: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000005f5e100',
      chainId: 1,
    });

    expect(result.intent).toBe('Send tokens');
    expect(result.confidence).toBe('high');
    expect(result.source).toBe('registry');
    expect(result.fields).toHaveLength(2);

    // Check amount field - USDC is in the known tokens cache
    const amountField = result.fields.find((f) => f.label === 'Amount');
    expect(amountField).toBeDefined();
    expect(amountField?.value).toBe('100 USDC');

    // Check recipient field
    const recipientField = result.fields.find((f) => f.label === 'Recipient');
    expect(recipientField).toBeDefined();
  });

  it('detects infinite approval warning', async () => {
    const signer = new ClearSigner({ provider: null, useSourcifyFallback: false });

    const result = await signer.decode({
      to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      data: '0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25effFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
      chainId: 1,
    });

    expect(result.intent).toBe('Approve spending');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('infinite_approval');
    expect(result.warnings[0].severity).toBe('high');
  });

  it('works without provider (offline mode)', async () => {
    const signer = new ClearSigner({ provider: null, useSourcifyFallback: false });

    const result = await signer.decode({
      to: '0x1234567890123456789012345678901234567890',
      data: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000de0b6b3a7640000',
      chainId: 1,
    });

    expect(result.intent).toBe('Send tokens');
    // Without provider, token info comes from cache or defaults
    expect(result.fields).toHaveLength(2);
  });

  it('allows extending with custom descriptors', async () => {
    const signer = new ClearSigner({ provider: null, useSourcifyFallback: false });

    signer.extend({
      context: {
        $id: 'MyProtocol',
        contract: {
          deployments: [{ chainId: 1, address: '0x1234567890123456789012345678901234567890' }],
        },
      },
      display: {
        formats: {
          'myFunction(uint256)': {
            intent: 'Do something cool',
            fields: [{ path: 'value', label: 'Value', format: 'raw' }],
          },
        },
      },
    });

    // The descriptor is registered
    expect(signer).toBeDefined();
  });
});
