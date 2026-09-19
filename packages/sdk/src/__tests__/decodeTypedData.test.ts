import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeTypedData } from '../decode/decodeTypedData.js';
import { encodeType, hashEncodeType } from '../decode/typedData.js';
import type { DecodeRegistry } from '../decode/types.js';
import { createOfficialRegistry } from '../official-registry/index.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';
import type { TypedDataInput } from '../types/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const PIN = '9f37816afde954ff6617fb5baa346133e5af26c5';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' as const;
const SPENDER = '0x1111111254eeb25477b68fb85ed929f73a960582' as const;
const PERMIT_HASH = '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9';
const DEADLINE = 1_735_689_600; // 2025-01-01T00:00:00Z

const PERMIT_FIELDS = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
] as const;

const DAI_PERMIT_FIELDS = [
  { name: 'holder', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'expiry', type: 'uint256' },
  { name: 'allowed', type: 'bool' },
] as const;

const usdcPermitVisible: InputDescriptor = {
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

function permitPayload(overrides?: Partial<TypedDataInput['message']>): TypedDataInput {
  return {
    chainId: 1,
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: 1,
      verifyingContract: USDC,
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Permit: [...PERMIT_FIELDS],
    },
    primaryType: 'Permit',
    message: {
      owner: VITALIK,
      spender: SPENDER,
      value: '100000000',
      nonce: '0',
      deadline: String(DEADLINE),
      ...overrides,
    },
  };
}

function daiPermitPayload(): TypedDataInput {
  return {
    chainId: 1,
    domain: {
      name: 'Dai Stablecoin',
      version: '1',
      chainId: 1,
      verifyingContract: USDC,
    },
    types: {
      Permit: [...DAI_PERMIT_FIELDS],
    },
    primaryType: 'Permit',
    message: {
      holder: VITALIK,
      spender: SPENDER,
      nonce: '0',
      expiry: String(DEADLINE),
      allowed: true,
    },
  };
}

function registryFrom(resolved: ResolvedDescriptor): DecodeRegistry {
  return {
    async findCalldata() {
      return null;
    },
    async findEip712() {
      return resolved;
    },
  };
}

describe('encodeType', () => {
  it('hashes ERC-2612 Permit to the well-known TYPEHASH', () => {
    const types = { Permit: [...PERMIT_FIELDS] };
    expect(encodeType('Permit', types)).toBe(
      'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
    );
    expect(hashEncodeType('Permit', types)).toBe(PERMIT_HASH);
  });

  it('ignores EIP712Domain and appends nested types alphabetically', () => {
    const types = {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' },
      ],
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' },
      ],
    };
    expect(encodeType('PermitSingle', types)).toBe(
      'PermitSingle(PermitDetails details,address spender,uint256 sigDeadline)PermitDetails(address token,uint160 amount,uint48 expiration,uint48 nonce)'
    );
  });
});

describe('decodeTypedData', () => {
  it('renders a USDC Permit owner, spender, value, and deadline', async () => {
    const resolved = await resolveDescriptor(usdcPermitVisible, createMemoryIncludeLoader({}));
    const result = await decodeTypedData(permitPayload(), {
      registry: registryFrom({ ...resolved, source: 'official-registry' }),
      provider: null,
      now: DEADLINE - 1,
    });

    expect(result.source).toBe('official-registry');
    expect(result.confidence).toBe('high');
    expect(result.trust).toMatchObject({ policy: 'unspecified', accepted: true });
    expect(result.intent).toBe('Authorize spending of tokens');
    expect(result.functionName).toBe('Permit');
    expect(result.raw.message).toMatchObject({
      owner: VITALIK,
      spender: SPENDER,
      value: 100000000n,
      deadline: BigInt(DEADLINE),
    });

    expect(result.fields.find((field) => field.label === 'Owner')?.value).toBe('0xd8da...6045');
    expect(result.fields.find((field) => field.label === 'Spender')?.value).toBe('1inch Router V5');
    expect(result.fields.find((field) => field.label === 'Amount')?.value).toBe('100 USDC');
    expect(result.fields.find((field) => field.label === 'Deadline')?.value).toContain('2025');
    expect(result.warnings.some((warning) => warning.type === 'expired_deadline')).toBe(false);
  });

  it('adds expired_deadline when the clock is frozen after the deadline', async () => {
    const resolved = await resolveDescriptor(usdcPermitVisible, createMemoryIncludeLoader({}));
    const result = await decodeTypedData(permitPayload(), {
      registry: registryFrom({ ...resolved, source: 'official-registry' }),
      provider: null,
      now: () => DEADLINE + 1,
    });

    expect(result.warnings.some((warning) => warning.type === 'expired_deadline')).toBe(true);
    const warning = result.warnings.find((item) => item.type === 'expired_deadline');
    expect(warning?.path).toBe('deadline');
    expect(warning?.severity).toBe('medium');
  });

  it('uses the official ERC-2612 include (hides owner / nonce)', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch({
        'index.calldata.json': {},
        'index.eip712.json': loadJson(join(fixtures, 'official-registry/index.eip712.json')),
        'registry/permit/eip712-permit-ethereum-usdc.json': loadJson(
          join(fixtures, 'official/permit-eip712-ethereum-usdc.json')
        ),
        'ercs/eip712-erc2612-permit.json': loadJson(
          join(fixtures, 'official-registry/ercs-eip712-erc2612-permit.json')
        ),
      }),
    });

    const result = await decodeTypedData(permitPayload(), {
      registry,
      provider: null,
      now: DEADLINE - 1,
    });

    expect(result.source).toBe('official-registry');
    expect(result.intent).toBe('Authorize spending of tokens');
    expect(result.fields.map((field) => field.label)).toEqual([
      'Spender',
      'Max spending amount',
      'Valid until',
    ]);
    expect(result.fields.find((field) => field.label === 'Max spending amount')?.value).toBe(
      '100 USDC'
    );
  });

  it('picks the descriptor whose encodeType hash matches when two Permit files apply', async () => {
    const daiHash = hashEncodeType('Permit', { Permit: [...DAI_PERMIT_FIELDS] });
    expect(daiHash).not.toBe(PERMIT_HASH);

    const erc2612: InputDescriptor = {
      context: {
        eip712: { deployments: [{ chainId: 1, address: USDC }] },
      },
      metadata: { owner: 'USDC' },
      display: {
        formats: {
          'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)': {
            intent: 'Authorize spending of tokens',
            fields: [{ path: 'spender', label: 'Spender', format: 'raw' }],
          },
        },
      },
    };
    const daiStyle: InputDescriptor = {
      context: {
        eip712: { deployments: [{ chainId: 1, address: USDC }] },
      },
      metadata: { owner: 'DAI-style' },
      display: {
        formats: {
          'Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)': {
            intent: 'Approve DAI',
            fields: [
              { path: 'holder', label: 'Holder', format: 'raw' },
              { path: 'allowed', label: 'Allowed', format: 'raw' },
            ],
          },
        },
      },
    };

    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch({
        'index.calldata.json': {},
        'index.eip712.json': {
          'eip155:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
            Permit: [
              {
                path: 'registry/permit/eip712-erc2612.json',
                encodeTypeHashes: [PERMIT_HASH],
              },
              {
                path: 'registry/permit/eip712-dai-style.json',
                encodeTypeHashes: [daiHash],
              },
            ],
          },
        },
        'registry/permit/eip712-erc2612.json': erc2612,
        'registry/permit/eip712-dai-style.json': daiStyle,
      }),
    });

    const erc2612Result = await decodeTypedData(permitPayload(), {
      registry,
      provider: null,
      now: DEADLINE - 1,
    });
    expect(erc2612Result.intent).toBe('Authorize spending of tokens');
    expect(erc2612Result.metadata.owner).toBe('USDC');

    const daiResult = await decodeTypedData(daiPermitPayload(), {
      registry,
      provider: null,
      now: DEADLINE - 1,
    });
    expect(daiResult.intent).toBe('Approve DAI');
    expect(daiResult.metadata.owner).toBe('DAI-style');
    expect(daiResult.fields.find((field) => field.label === 'Allowed')?.value).toBe('Yes');
  });

  it('does not treat a different Permit declaration as a match by name alone', async () => {
    const daiStyle: InputDescriptor = {
      context: {
        eip712: { deployments: [{ chainId: 1, address: USDC }] },
      },
      metadata: { owner: 'DAI-style' },
      display: {
        formats: {
          'Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)': {
            intent: 'Approve DAI',
            fields: [
              { path: 'holder', label: 'Holder', format: 'raw' },
              { path: 'allowed', label: 'Allowed', format: 'raw' },
            ],
          },
        },
      },
    };
    const resolved = await resolveDescriptor(daiStyle, createMemoryIncludeLoader({}));
    const result = await decodeTypedData(permitPayload(), {
      registry: registryFrom(resolved),
      provider: null,
      now: DEADLINE - 1,
    });

    expect(result.source).toBe('inferred');
    expect(result.confidence).toBe('low');
    expect(result.intent).not.toBe('Approve DAI');
    expect(result.fields.find((field) => field.label === 'Allowed')).toBeUndefined();
  });

  it('does not apply a Permit descriptor when the EIP-712 domain name does not match', async () => {
    const resolved = await resolveDescriptor(usdcPermitVisible, createMemoryIncludeLoader({}));
    const result = await decodeTypedData(
      {
        ...permitPayload(),
        domain: { ...permitPayload().domain, name: 'Fake Coin' },
      },
      { registry: registryFrom(resolved), provider: null, now: DEADLINE - 1 }
    );

    expect(result.source).toBe('inferred');
    expect(result.confidence).toBe('low');
    expect(result.intent).toBe('Sign Permit');
  });

  it('returns inferred + low confidence when no descriptor matches', async () => {
    const result = await decodeTypedData(permitPayload(), {
      provider: null,
      now: DEADLINE - 1,
    });

    expect(result.source).toBe('inferred');
    expect(result.confidence).toBe('low');
    expect(result.trust.accepted).toBe(false);
    expect(result.functionName).toBe('Permit');
    expect(result.fields.map((field) => field.path)).toEqual([
      'owner',
      'spender',
      'value',
      'nonce',
      'deadline',
    ]);
  });
});
