import { describe, expect, it } from 'vitest';
import { ClearSigner, createClearSigner } from '../core/ClearSigner.js';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import { decodeTypedData } from '../decode/decodeTypedData.js';
import type { DecodeRegistry } from '../decode/types.js';
import { officialOnlyPolicy, officialOrLocalPolicy } from '../trust/index.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const VITALIK = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
const SPENDER = '0x1111111254eeb25477b68fb85ed929f73a960582' as const;

const TRANSFER_100_USDC =
  `0xa9059cbb000000000000000000000000${VITALIK}0000000000000000000000000000000000000000000000000000000005f5e100` as const;

const usdcDescriptor: InputDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    $id: 'USD Coin',
    contract: {
      deployments: [{ chainId: 1, address: USDC }],
    },
  },
  metadata: {
    owner: 'Centre',
    contractName: 'USD Coin',
    info: { url: 'https://www.circle.com/', deploymentDate: '2018-09-15T00:00:00Z' },
    token: { name: 'USD Coin', ticker: 'USDC', decimals: 6 },
  },
  display: {
    formats: {
      'transfer(address to,uint256 value)': {
        intent: 'Send',
        interpolatedIntent: 'Send {value} to {to}',
        fields: [
          { path: 'to', label: 'Recipient', format: 'addressName' },
          {
            path: 'value',
            label: 'Amount',
            format: 'tokenAmount',
            params: { tokenPath: '@.to' },
          },
        ],
      },
    },
  },
};

const usdcPermit: InputDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    $id: 'USDC Permit',
    eip712: {
      deployments: [{ chainId: 1, address: USDC }],
      domain: { name: 'USD Coin', version: '2' },
    },
  },
  metadata: {
    owner: 'USDC',
    contractName: 'USD Coin',
    info: { url: 'https://www.circle.com/', deploymentDate: '2018-09-15T00:00:00Z' },
    token: { name: 'USD Coin', ticker: 'USDC', decimals: 6 },
  },
  display: {
    formats: {
      'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)': {
        intent: 'Authorize spending of tokens',
        fields: [
          { path: 'owner', label: 'Owner', format: 'addressName' },
          { path: 'spender', label: 'Spender', format: 'addressName' },
          {
            path: 'value',
            label: 'Amount',
            format: 'tokenAmount',
            params: { tokenPath: '@.to' },
          },
        ],
      },
    },
  },
};

const transferTx = { to: USDC, data: TRANSFER_100_USDC, chainId: 1 };

const permitTypedData = {
  chainId: 1,
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 1,
    verifyingContract: USDC,
  },
  types: {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Permit',
  message: {
    owner: `0x${VITALIK}`,
    spender: SPENDER,
    value: 100000000n,
    nonce: 0n,
    deadline: 1_735_689_600n,
  },
};

describe('createClearSigner', () => {
  it('returns a ClearSigner instance', () => {
    const signer = createClearSigner({ provider: null, useSourcifyFallback: false });
    expect(signer).toBeInstanceOf(ClearSigner);
  });

  it('decode is an alias of decodeTransaction', async () => {
    const signer = createClearSigner({ provider: null, useSourcifyFallback: false });
    const viaAlias = await signer.decode(transferTx);
    const viaMethod = await signer.decodeTransaction(transferTx);
    const viaFunction = await decodeTransaction(transferTx, {
      provider: null,
      useSourcifyFallback: false,
    });

    expect(viaAlias).toEqual(viaMethod);
    expect(viaAlias.source).toBe(viaFunction.source);
    expect(viaAlias.intent).toBe(viaFunction.intent);
    expect(viaAlias.confidence).toBe('low');
  });

  it('applies extend() overrides before decode', async () => {
    const signer = createClearSigner({
      provider: null,
      useSourcifyFallback: false,
      trust: officialOrLocalPolicy(),
    });
    signer.extend(usdcDescriptor);

    const result = await signer.decodeTransaction(transferTx);

    expect(result.source).toBe('local-override');
    expect(result.confidence).toBe('medium');
    expect(result.trust.accepted).toBe(true);
    expect(result.intent).toMatch(/^Send /);
    const amount = result.fields.find((field) => field.label === 'Amount');
    expect(amount?.value).toBe('100 USDC');
  });

  it('rejects local overrides under officialOnlyPolicy', async () => {
    const signer = createClearSigner({
      provider: null,
      useSourcifyFallback: false,
      trust: officialOnlyPolicy(),
    });
    signer.extend([usdcDescriptor]);

    const result = await signer.decodeTransaction(transferTx);

    expect(result.source).toBe('local-override');
    expect(result.trust.accepted).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.warnings.some((warning) => warning.type === 'untrusted_descriptor')).toBe(true);
  });

  it('decodeTypedData uses the bound registry', async () => {
    const signer = createClearSigner({
      provider: null,
      useSourcifyFallback: false,
      trust: officialOrLocalPolicy(),
    });
    signer.extend(usdcPermit);

    const result = await signer.decodeTypedData(permitTypedData);
    const viaFunction = await decodeTypedData(permitTypedData, {
      provider: null,
      useSourcifyFallback: false,
    });

    expect(result.source).toBe('local-override');
    expect(result.intent).toBe('Authorize spending of tokens');
    expect(viaFunction.source).toBe('inferred');
  });

  it('wraps a DecodeRegistry that has no extend()', async () => {
    const hits: string[] = [];
    const base: DecodeRegistry = {
      async findCalldata() {
        hits.push('base');
        return null;
      },
    };
    const signer = createClearSigner({
      registry: base,
      provider: null,
      useSourcifyFallback: false,
      trust: officialOrLocalPolicy(),
    });
    signer.extend(usdcDescriptor);

    const result = await signer.decodeTransaction(transferTx);

    expect(result.source).toBe('local-override');
    expect(hits).toEqual([]);
  });

  it('does not mutate a DecodeRegistry without extend when wrapping', async () => {
    const resolved = {
      source: 'official-registry',
    } as ResolvedDescriptor;
    const base: DecodeRegistry = {
      async findCalldata() {
        return resolved;
      },
    };
    const signer = createClearSigner({
      registry: base,
      provider: null,
      useSourcifyFallback: false,
    });

    expect('extend' in base).toBe(false);
    expect(() => signer.extend(usdcDescriptor)).not.toThrow();
  });
});
