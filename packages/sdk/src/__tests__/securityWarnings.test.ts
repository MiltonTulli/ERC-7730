import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { computeSelector } from '../core/signatures.js';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import { decodeTypedData } from '../decode/decodeTypedData.js';
import {
  type DecodeRegistry,
  SECURITY_WARNING_TYPES,
  type SecurityWarningType,
} from '../decode/types.js';
import { createOfficialRegistry } from '../official-registry/index.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';
import type { TypedDataInput } from '../types/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const PIN = '9f37816afde954ff6617fb5baa346133e5af26c5';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const RANDOM = '0x1234567890123456789012345678901234567890' as const;
const OWNER = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' as const;
const SPENDER = '0x1111111254eeb25477b68fb85ed929f73a960582' as const;
const DEADLINE = 1_735_689_600;

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
      'approve(address spender,uint256 value)': {
        intent: 'Approve',
        fields: [
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

const permitDescriptor: InputDescriptor = {
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
          { path: 'spender', label: 'Spender', format: 'addressName' },
          {
            path: 'value',
            label: 'Amount',
            format: 'tokenAmount',
            params: { tokenPath: '@.to' },
          },
          {
            path: 'deadline',
            label: 'Deadline',
            format: 'date',
            params: { encoding: 'timestamp' },
          },
        ],
      },
    },
  },
};

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function mockFetch(files: Record<string, unknown>): typeof fetch {
  return async (input) => {
    const url = String(input);
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

function padAddress(address: string): string {
  return address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

function calldata(signature: string, address: string): `0x${string}` {
  return `0x${computeSelector(signature).slice(2)}${padAddress(address)}`;
}

function registryFrom(resolved: ResolvedDescriptor): DecodeRegistry {
  return {
    async findCalldata() {
      return resolved;
    },
  };
}

function permitPayload(): TypedDataInput {
  return {
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
      owner: OWNER,
      spender: SPENDER,
      value: '100000000',
      nonce: '0',
      deadline: String(DEADLINE),
    },
  };
}

describe('SECURITY_WARNING_TYPES', () => {
  it('keeps every check type in the public union', () => {
    const required: Record<SecurityWarningType, true> = {
      infinite_approval: true,
      dangerous_permissions: true,
      untrusted_descriptor: true,
      untrusted_spender: true,
      ownership_change: true,
      proxy_upgrade: true,
      expired_deadline: true,
      selector_mismatch: true,
      missing_metadata: true,
    };
    expect([...SECURITY_WARNING_TYPES].sort()).toEqual(Object.keys(required).sort());
  });
});

describe('decode security warnings', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
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
    const warning = result.warnings.find((item) => item.type === 'infinite_approval');
    expect(warning?.severity).toBe('high');
    expect(warning?.message).toBeTruthy();
  });

  it('adds untrusted_spender when the spender is not in the registry', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });
    const result = await decodeTransaction(
      { to: USDC, data: APPROVE_MAX, chainId: 1 },
      { registry, provider: null, useSourcifyFallback: false }
    );
    const warning = result.warnings.find((item) => item.type === 'untrusted_spender');
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('high');
    expect(warning?.path).toBe('spender');
  });

  it('does not add untrusted_spender when the spender has an official descriptor', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });
    const amount = '0000000000000000000000000000000000000000000000000000000005f5e100';
    const data = `0x095ea7b3${padAddress(WETH)}${amount}` as `0x${string}`;
    const result = await decodeTransaction(
      { to: USDC, data, chainId: 1 },
      { registry, provider: null, useSourcifyFallback: false }
    );
    expect(result.warnings.some((warning) => warning.type === 'untrusted_spender')).toBe(false);
  });

  it('adds untrusted_spender on an EIP-712 Permit whose spender is unknown', async () => {
    const resolved = await resolveDescriptor(permitDescriptor, createMemoryIncludeLoader({}));
    const result = await decodeTypedData(permitPayload(), {
      registry: {
        async findCalldata() {
          return null;
        },
        async findEip712(key) {
          if (key.address.toLowerCase() !== USDC.toLowerCase()) {
            return null;
          }
          return { ...resolved, source: 'official-registry' };
        },
      },
      provider: null,
      now: DEADLINE - 1,
    });
    expect(result.warnings.some((warning) => warning.type === 'untrusted_spender')).toBe(true);
  });

  it('adds ownership_change for transferOwnership(address) 0xf2fde38b', async () => {
    expect(computeSelector('transferOwnership(address)')).toBe('0xf2fde38b');
    const result = await decodeTransaction(
      { to: RANDOM, data: calldata('transferOwnership(address)', OWNER), chainId: 1 },
      { provider: null, useSourcifyFallback: false }
    );
    const warning = result.warnings.find((item) => item.type === 'ownership_change');
    expect(result.functionName).toBe('transferOwnership');
    expect(warning?.severity).toBe('high');
    expect(warning?.message).toBeTruthy();
  });

  it('adds proxy_upgrade for upgradeTo(address) 0x3659cfe6', async () => {
    expect(computeSelector('upgradeTo(address)')).toBe('0x3659cfe6');
    const result = await decodeTransaction(
      { to: RANDOM, data: calldata('upgradeTo(address)', OWNER), chainId: 1 },
      { provider: null, useSourcifyFallback: false }
    );
    const warning = result.warnings.find((item) => item.type === 'proxy_upgrade');
    expect(result.functionName).toBe('upgradeTo');
    expect(warning?.severity).toBe('high');
    expect(warning?.message).toBeTruthy();
  });

  it('adds expired_deadline for a calldata date field in the past', async () => {
    const descriptor: InputDescriptor = {
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: RANDOM }],
        },
      },
      metadata: {
        owner: 'Test',
        info: { url: 'https://example.invalid/', deploymentDate: '2020-01-01T00:00:00Z' },
      },
      display: {
        formats: {
          'permit(address spender,uint256 deadline)': {
            intent: 'Permit',
            fields: [
              { path: 'spender', label: 'Spender', format: 'addressName' },
              {
                path: 'deadline',
                label: 'Deadline',
                format: 'date',
                params: { encoding: 'timestamp' },
              },
            ],
          },
        },
      },
    };
    const resolved = await resolveDescriptor(descriptor, createMemoryIncludeLoader({}));
    const selector = computeSelector('permit(address,uint256)').slice(2);
    const past = 1_577_836_800;
    const data =
      `0x${selector}${padAddress(SPENDER)}${past.toString(16).padStart(64, '0')}` as `0x${string}`;
    const result = await decodeTransaction(
      { to: RANDOM, data, chainId: 1 },
      {
        registry: registryFrom(resolved),
        provider: null,
        useSourcifyFallback: false,
        now: past + 1,
      }
    );
    const warning = result.warnings.find((item) => item.type === 'expired_deadline');
    expect(warning?.path).toBe('deadline');
    expect(warning?.severity).toBe('medium');
  });

  it('adds selector_mismatch when Sourcify ABI lacks a well-known selector', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (!url.includes('sourcify.dev')) {
        return new Response('not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          match: 'exact_match',
          abi: [
            {
              type: 'function',
              name: 'foo',
              inputs: [],
              stateMutability: 'nonpayable',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    const result = await decodeTransaction(
      { to: RANDOM, data: APPROVE_MAX, chainId: 1 },
      { provider: null }
    );
    const warning = result.warnings.find((item) => item.type === 'selector_mismatch');
    expect(result.source).not.toBe('sourcify');
    expect(warning?.severity).toBe('medium');
    expect(warning?.message).toBeTruthy();
  });

  it('adds missing_metadata when decode runs with no descriptor', async () => {
    const result = await decodeTransaction(
      { to: RANDOM, data: '0x12345678abcdef', chainId: 1 },
      { provider: null, useSourcifyFallback: false }
    );
    expect(result.source).toBe('basic');
    const warning = result.warnings.find((item) => item.type === 'missing_metadata');
    expect(warning?.severity).toBe('medium');
    expect(warning?.message).toMatch(/descriptor/i);
  });
});
