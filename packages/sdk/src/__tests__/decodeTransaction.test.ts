import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeSelector } from '../core/signatures.js';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import type { DecodeRegistry } from '../decode/types.js';
import { createOfficialRegistry } from '../official-registry/index.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const PIN = '9f37816afde954ff6617fb5baa346133e5af26c5';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const VITALIK = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';

const TRANSFER_100_USDC =
  `0xa9059cbb000000000000000000000000${VITALIK}0000000000000000000000000000000000000000000000000000000005f5e100` as const;

const APPROVE_MAX =
  '0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as const;

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
      'approve(address spender,uint256 value)': {
        intent: 'Approve',
        fields: [
          { path: 'spender', label: 'Spender', format: 'addressName' },
          {
            path: 'value',
            label: 'Amount',
            format: 'tokenAmount',
            params: {
              tokenPath: '@.to',
              threshold: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
              message: 'Unlimited',
            },
          },
        ],
      },
    },
  },
};

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function mockFetch(files: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return async (input) => {
    const url = String(input);
    calls.push(url);
    const marker = `/${PIN}/`;
    const idx = url.indexOf(marker);
    const path = idx === -1 ? url : url.slice(idx + marker.length);
    if (!(path in files)) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(files[path]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function officialFiles(): Record<string, unknown> {
  return {
    'index.calldata.json': {
      'eip155:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'registry/usdc/calldata-usdc.json',
      'eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'registry/weth/calldata-weth.json',
    },
    'index.eip712.json': {},
    'registry/usdc/calldata-usdc.json': usdcDescriptor,
    'registry/weth/calldata-weth.json': loadJson(
      join(fixtures, 'official/weth-calldata-weth.json')
    ),
  };
}

function registryFrom(resolved: ResolvedDescriptor): DecodeRegistry {
  return {
    async findCalldata() {
      return resolved;
    },
  };
}

describe('decodeTransaction', () => {
  it('renders a USDC transfer with 6 decimals from an official descriptor', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });

    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      { registry, provider: null, useSourcifyFallback: false }
    );

    expect(result.source).toBe('official-registry');
    expect(result.confidence).toBe('high');
    expect(result.trust).toMatchObject({ policy: 'unspecified', accepted: true });
    expect(result.intent).toBe('Send 100 USDC to 0xd8da...6045');
    expect(result.functionName).toBe('transfer');

    const amount = result.fields.find((field) => field.label === 'Amount');
    expect(amount?.value).toBe('100 USDC');
    expect(amount?.rawValue).toBe(100000000n);

    const recipient = result.fields.find((field) => field.label === 'Recipient');
    expect(recipient).toBeDefined();
    expect(recipient?.format).toBe('addressName');
  });

  it('adds infinite_approval for max uint256 approve', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });

    const result = await decodeTransaction(
      { to: USDC, data: APPROVE_MAX, chainId: 1 },
      { registry, provider: null, useSourcifyFallback: false }
    );

    expect(result.intent).toBe('Approve');
    expect(result.warnings.some((warning) => warning.type === 'infinite_approval')).toBe(true);
    const amount = result.fields.find((field) => field.label === 'Amount');
    expect(amount?.value).toMatch(/Unlimited/);
  });

  it('returns source basic and confidence low when no descriptor matches', async () => {
    const result = await decodeTransaction(
      {
        to: '0x1234567890123456789012345678901234567890',
        data: '0x12345678abcdef',
        chainId: 1,
      },
      { provider: null, useSourcifyFallback: false }
    );

    expect(result.source).toBe('basic');
    expect(result.confidence).toBe('low');
    expect(result.trust.accepted).toBe(false);
    expect(result.trust.policy).toBe('unspecified');
  });

  it('sets source official-registry for a WETH deposit from the registry client', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });

    const result = await decodeTransaction(
      {
        to: WETH,
        data: '0xd0e30db0',
        chainId: 1,
        value: 10n ** 18n,
      },
      { registry, provider: null, useSourcifyFallback: false }
    );

    expect(result.source).toBe('official-registry');
    expect(result.confidence).toBe('high');
    expect(result.intent).toBe('Wrap');
    expect(result.fields[0]).toMatchObject({
      path: '@.value',
      label: 'Amount',
      format: 'amount',
      value: '1 ETH',
    });
  });
});

describe('decodeTransaction formats', () => {
  async function decodeWith(descriptor: InputDescriptor, data: string, extra?: object) {
    const resolved = await resolveDescriptor(descriptor, createMemoryIncludeLoader({}));
    return decodeTransaction(
      {
        to: '0x1111111111111111111111111111111111111111',
        data,
        chainId: 1,
        ...extra,
      },
      { registry: registryFrom(resolved), provider: null, useSourcifyFallback: false }
    );
  }

  it('formats date, duration, enum, nftName, and raw', async () => {
    const descriptor: InputDescriptor = {
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0x1111111111111111111111111111111111111111' }],
        },
      },
      metadata: {
        owner: 'Test',
        info: { url: 'https://example.invalid/', deploymentDate: '2020-01-01T00:00:00Z' },
        enums: { rateMode: { '1': 'Stable', '2': 'Variable' } },
      },
      display: {
        formats: {
          'demo(uint256 when,uint256 lock,uint256 mode,uint256 id)': {
            intent: 'Demo',
            fields: [
              { path: 'when', label: 'When', format: 'date', params: { encoding: 'timestamp' } },
              { path: 'lock', label: 'Lock', format: 'duration' },
              {
                path: 'mode',
                label: 'Mode',
                format: 'enum',
                params: { $ref: '$.metadata.enums.rateMode' },
              },
              {
                path: 'id',
                label: 'NFT',
                format: 'nftName',
                params: { collection: '@.to' },
              },
            ],
          },
        },
      },
    };

    const when = 1_577_836_800; // 2020-01-01T00:00:00Z
    const selector = computeSelector('demo(uint256,uint256,uint256,uint256)').slice(2);
    const word = (n: number) => n.toString(16).padStart(64, '0');
    const calldata = `0x${selector}${word(when)}${word(3661)}${word(1)}${word(42)}`;

    const result = await decodeWith(descriptor, calldata);
    expect(result.fields.find((field) => field.label === 'When')?.value).toContain('2020');
    expect(result.fields.find((field) => field.label === 'Lock')?.value).toBe('01:01:01');
    expect(result.fields.find((field) => field.label === 'Mode')?.value).toBe('Stable');
    expect(result.fields.find((field) => field.label === 'NFT')?.value).toContain('#42');
  });

  it('honors excluded paths and required flags on a merged descriptor', async () => {
    const merged: InputDescriptor = {
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0x1111111111111111111111111111111111111111' }],
        },
      },
      display: {
        formats: {
          'transfer(address to,uint256 value)': {
            intent: 'Send',
            fields: [
              { path: 'to', label: 'Recipient', format: 'raw' },
              { path: 'value', label: 'Amount', format: 'raw' },
              { path: 'salt', label: 'Salt', format: 'raw' },
            ],
            required: ['to', 'value'],
            excluded: ['salt'],
          },
        },
      },
    };

    const resolved: ResolvedDescriptor = {
      version: '1',
      hash: `0x${'ab'.repeat(32)}`,
      input: merged,
      merged,
      deployments: [{ chainId: 1, address: '0x1111111111111111111111111111111111111111' }],
    };

    const result = await decodeTransaction(
      { to: '0x1111111111111111111111111111111111111111', data: TRANSFER_100_USDC, chainId: 1 },
      { registry: registryFrom(resolved), provider: null, useSourcifyFallback: false }
    );

    expect(result.excluded).toEqual(['salt']);
    expect(result.fields.map((field) => field.label)).toEqual(['Recipient', 'Amount']);
    expect(result.fields.every((field) => field.required)).toBe(true);
  });

  it('resolves Solidity-declaration names (#._to) from USDT-style keys', async () => {
    const descriptor: InputDescriptor = {
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: USDC }],
        },
      },
      metadata: {
        owner: 'Tether',
        info: { url: 'https://tether.to/', deploymentDate: '2017-11-28T12:41:21Z' },
        token: { name: 'USD Coin', ticker: 'USDC', decimals: 6 },
      },
      display: {
        formats: {
          'transfer(address _to, uint256 _value)': {
            intent: 'Send',
            fields: [
              { path: '#._to', label: 'To', format: 'raw' },
              {
                path: '#._value',
                label: 'Amount',
                format: 'tokenAmount',
                params: { tokenPath: '@.to' },
              },
            ],
          },
        },
      },
    };

    const resolved = await resolveDescriptor(descriptor, createMemoryIncludeLoader({}));
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      { registry: registryFrom(resolved), provider: null, useSourcifyFallback: false }
    );

    expect(result.fields.find((field) => field.label === 'To')?.rawValue).toBe(`0x${VITALIK}`);
    expect(result.fields.find((field) => field.label === 'Amount')?.value).toBe('100 USDC');
  });
});
