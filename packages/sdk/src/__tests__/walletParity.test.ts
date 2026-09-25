import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Hex, encodePacked, keccak256, stringToHex, zeroAddress, zeroHash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { decodeBatch } from '../decode/decodeBatch.js';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import type { DecodeRegistry, ExternalDataProvider } from '../decode/types.js';
import { createOfficialRegistry } from '../official-registry/index.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import {
  EAS_CONTRACT,
  ERC8176_SCHEMA_UID,
  attestedPolicy,
  offchainAttestationUid,
} from '../trust/index.js';
import { officialOnlyPolicy } from '../trust/policy.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const PIN = '9f37816afde954ff6617fb5baa346133e5af26c5';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const VITALIK = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
const UNKNOWN_TOKEN = '0x1111111111111111111111111111111111111111' as const;

const TRANSFER_100_USDC =
  `0xa9059cbb000000000000000000000000${VITALIK}0000000000000000000000000000000000000000000000000000000005f5e100` as const;

const WETH_DEPOSIT = '0xd0e30db0' as const;

const ATTESTER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const attesterAccount = privateKeyToAccount(ATTESTER_KEY);

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
            params: { tokenPath: '@.to' },
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

function registryFrom(resolved: ResolvedDescriptor): DecodeRegistry {
  return {
    async findCalldata() {
      return resolved;
    },
  };
}

async function signAttestation(descriptorHash: Hex, overrides?: { salt?: Hex }) {
  const salt =
    overrides?.salt ??
    ('0x1111111111111111111111111111111111111111111111111111111111111111' as Hex);
  const time = 1_700_000_000n;
  const message = {
    version: 2,
    schema: ERC8176_SCHEMA_UID,
    recipient: zeroAddress,
    time,
    expirationTime: 0n,
    revocable: true,
    refUID: zeroHash,
    data: descriptorHash,
    salt,
  };
  const uid = offchainAttestationUid({
    schema: ERC8176_SCHEMA_UID,
    recipient: zeroAddress,
    time,
    expirationTime: 0n,
    revocable: true,
    refUID: zeroHash,
    data: descriptorHash,
    salt,
  });
  const signature = await attesterAccount.signTypedData({
    domain: {
      name: 'EAS Attestation',
      version: '0.26',
      chainId: 1,
      verifyingContract: EAS_CONTRACT,
    },
    types: {
      Attest: [
        { name: 'version', type: 'uint16' },
        { name: 'schema', type: 'bytes32' },
        { name: 'recipient', type: 'address' },
        { name: 'time', type: 'uint64' },
        { name: 'expirationTime', type: 'uint64' },
        { name: 'revocable', type: 'bool' },
        { name: 'refUID', type: 'bytes32' },
        { name: 'data', type: 'bytes' },
        { name: 'salt', type: 'bytes32' },
      ],
    },
    primaryType: 'Attest',
    message,
  });
  return {
    sig: {
      domain: {
        name: 'EAS Attestation',
        version: '0.26',
        chainId: 1,
        verifyingContract: EAS_CONTRACT,
      },
      primaryType: 'Attest',
      types: {
        Attest: [
          { name: 'version', type: 'uint16' },
          { name: 'schema', type: 'bytes32' },
          { name: 'recipient', type: 'address' },
          { name: 'time', type: 'uint64' },
          { name: 'expirationTime', type: 'uint64' },
          { name: 'revocable', type: 'bool' },
          { name: 'refUID', type: 'bytes32' },
          { name: 'data', type: 'bytes' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      message,
      uid,
      signature,
    },
    signer: attesterAccount.address,
  };
}

describe('wallet drop-in parity (#53)', () => {
  it('renders interpolatedIntent when the template fills', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      { registry, provider: null, useSourcifyFallback: false }
    );
    expect(result.intent).toBe('Send 100 USDC to 0xd8da...6045');
    expect(result.interpolatedIntent).toBe('Send 100 USDC to 0xd8da...6045');
  });

  it('keeps intent + fields when the descriptor has no interpolation template', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });
    const result = await decodeTransaction(
      {
        to: USDC,
        data: '0x095ea7b3000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff0000000000000000000000000000000000000000000000000000000005f5e100',
        chainId: 1,
      },
      { registry, provider: null, useSourcifyFallback: false }
    );
    expect(result.intent).toBe('Approve');
    expect(result.interpolatedIntent).toBeUndefined();
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('warns when interpolation cannot fill a placeholder', async () => {
    const broken: InputDescriptor = {
      ...usdcDescriptor,
      display: {
        formats: {
          'transfer(address to,uint256 value)': {
            intent: 'Send',
            interpolatedIntent: 'Send {value} to {missing}',
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
    const resolved = await resolveDescriptor(broken, createMemoryIncludeLoader({}));
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      { registry: registryFrom(resolved), provider: null, useSourcifyFallback: false }
    );
    expect(result.intent).toBe('Send');
    expect(result.interpolatedIntent).toBeUndefined();
    expect(result.warnings.some((warning) => warning.type === 'interpolation_failed')).toBe(true);
  });

  it('joins EIP-5792 batch intents with " and "', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });
    const batch = await decodeBatch(
      {
        chainId: 1,
        calls: [
          { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
          { to: WETH, data: WETH_DEPOSIT, chainId: 1, value: 1n },
        ],
      },
      { registry, provider: null, useSourcifyFallback: false }
    );
    expect(batch.calls).toHaveLength(2);
    expect(batch.calls[0]?.source).toBe('official-registry');
    expect(batch.calls[1]?.source).toBe('official-registry');
    expect(batch.interpolatedIntent).toContain(' and ');
    const left = batch.calls[0]?.interpolatedIntent ?? batch.calls[0]?.intent;
    const right = batch.calls[1]?.interpolatedIntent ?? batch.calls[1]?.intent;
    expect(batch.interpolatedIntent).toBe(`${left} and ${right}`);
  });

  it('formats tokenAmount with a mocked ExternalDataProvider only', async () => {
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error('network should not be used');
    }) as typeof fetch;

    const descriptor: InputDescriptor = {
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: UNKNOWN_TOKEN }],
        },
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
    const resolved = await resolveDescriptor(descriptor, createMemoryIncludeLoader({}));
    const provider: ExternalDataProvider = {
      resolveToken: async () => ({ symbol: 'MOCK', decimals: 6, name: 'Mock' }),
    };
    try {
      const result = await decodeTransaction(
        {
          to: UNKNOWN_TOKEN,
          data: TRANSFER_100_USDC,
          chainId: 1,
        },
        {
          registry: registryFrom({ ...resolved, source: 'local-override' }),
          provider: null,
          useSourcifyFallback: false,
          externalDataProvider: provider,
        }
      );
      const amount = result.fields.find((field) => field.label === 'Amount');
      expect(amount?.value).toBe('100 MOCK');
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses trustedTokens templates without high confidence under officialOnly', async () => {
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        provider: null,
        useSourcifyFallback: false,
        trust: officialOnlyPolicy(),
        trustedTokens: {
          1: { [USDC.toLowerCase()]: 'erc20' },
        },
      }
    );
    expect(result.source).toBe('trusted-token');
    expect(result.confidence).toBe('low');
    expect(result.trust.accepted).toBe(false);
    expect(result.fields.some((field) => field.label === 'Recipient')).toBe(true);
    expect(result.fields.some((field) => field.label === 'Amount')).toBe(true);
  });

  it('lets a registry descriptor win over trustedTokens', async () => {
    const registry = createOfficialRegistry({
      pin: PIN,
      fetch: mockFetch(officialFiles()),
    });
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry,
        provider: null,
        useSourcifyFallback: false,
        trustedTokens: {
          1: { [USDC.toLowerCase()]: 'erc20' },
        },
      }
    );
    expect(result.source).toBe('official-registry');
    expect(result.confidence).toBe('high');
  });

  it('accepts a valid ERC-8176 attestation and rejects revoked / unknown / incomplete', async () => {
    const resolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
    const attestation = await signAttestation(resolved.hash);
    const withAttestation: ResolvedDescriptor = {
      ...resolved,
      source: 'official-registry',
      attestations: [attestation],
    };

    const accepted = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry: registryFrom(withAttestation),
        provider: null,
        useSourcifyFallback: false,
        trust: attestedPolicy({
          attesters: [attesterAccount.address],
          eas: {
            call: async () => '0x0000000000000000000000000000000000000000000000000000000000000000',
          },
        }),
      }
    );
    expect(accepted.source).toBe('attested');
    expect(accepted.confidence).toBe('high');
    expect(accepted.trust.accepted).toBe(true);
    expect(accepted.trust.attesters?.[0]?.toLowerCase()).toBe(
      attesterAccount.address.toLowerCase()
    );

    const revoked = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry: registryFrom(withAttestation),
        provider: null,
        useSourcifyFallback: false,
        trust: attestedPolicy({
          attesters: [attesterAccount.address],
          eas: {
            call: async () => '0x0000000000000000000000000000000000000000000000000000000000000001',
          },
        }),
      }
    );
    expect(revoked.trust.accepted).toBe(false);
    expect(revoked.confidence).not.toBe('high');
    expect(revoked.warnings.some((warning) => warning.type === 'NO_TRUSTED_ATTESTATION')).toBe(
      true
    );

    const unknown = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry: registryFrom(withAttestation),
        provider: null,
        useSourcifyFallback: false,
        trust: attestedPolicy({
          attesters: ['0x0000000000000000000000000000000000000001'],
          eas: {
            call: async () => '0x0000000000000000000000000000000000000000000000000000000000000000',
          },
        }),
      }
    );
    expect(unknown.trust.accepted).toBe(false);
    expect(unknown.warnings.some((warning) => warning.type === 'NO_TRUSTED_ATTESTATION')).toBe(
      true
    );

    const incomplete = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry: registryFrom(withAttestation),
        provider: null,
        useSourcifyFallback: false,
        trust: attestedPolicy({ attesters: [attesterAccount.address] }),
      }
    );
    expect(incomplete.trust.accepted).toBe(false);
    expect(incomplete.trust.reasons).toContain('ATTESTATION_OPTIONS_INCOMPLETE');
    expect(incomplete.warnings.some((warning) => warning.type === 'NO_TRUSTED_ATTESTATION')).toBe(
      true
    );
  });

  it('renders nested calldata fields as embedded operations', async () => {
    const innerData = TRANSFER_100_USDC;
    const descriptor: InputDescriptor = {
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: WETH }],
        },
      },
      display: {
        formats: {
          'execute(address target,bytes data)': {
            intent: 'Execute',
            fields: [
              {
                path: 'data',
                label: 'Inner call',
                format: 'calldata',
                params: { calleePath: '#.target' },
              },
            ],
          },
        },
      },
    };
    const resolved = await resolveDescriptor(descriptor, createMemoryIncludeLoader({}));
    const usdcResolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
    const registry: DecodeRegistry = {
      async findCalldata(key) {
        if (key.address.toLowerCase() === USDC.toLowerCase()) {
          return { ...usdcResolved, source: 'official-registry' };
        }
        if (key.address.toLowerCase() === WETH.toLowerCase()) {
          return { ...resolved, source: 'local-override' };
        }
        return null;
      },
    };

    // execute(address,bytes) selector
    const executeSelector = keccak256(encodePacked(['string'], ['execute(address,bytes)'])).slice(
      0,
      10
    );
    const targetWord = USDC.slice(2).toLowerCase().padStart(64, '0');
    const offset = (64).toString(16).padStart(64, '0');
    const length = ((innerData.length - 2) / 2).toString(16).padStart(64, '0');
    const payload = innerData.slice(2).padEnd(Math.ceil((innerData.length - 2) / 64) * 64, '0');
    const data = `${executeSelector}${targetWord}${offset}${length}${payload}` as Hex;

    const result = await decodeTransaction(
      { to: WETH, data, chainId: 1 },
      { registry, provider: null, useSourcifyFallback: false }
    );
    const inner = result.fields.find((field) => field.format === 'calldata');
    expect(inner?.embedded?.source).toBe('official-registry');
    expect(inner?.value).toContain('Send');
  });

  it('keeps lite free of RPC and Sourcify static imports', async () => {
    const { readFileSync: read } = await import('node:fs');
    const { dirname: dir, join: j } = await import('node:path');
    const { fileURLToPath: toPath } = await import('node:url');
    const root = j(dir(toPath(import.meta.url)), '..');
    const visited = new Set<string>();
    const queue = [j(root, 'lite.ts')];
    const importRe = /from\s+['"](\.[^'"]+)['"]/g;

    while (queue.length > 0) {
      const file = queue.pop();
      if (!file || visited.has(file)) {
        continue;
      }
      visited.add(file);
      const source = read(file, 'utf8');
      expect(source.includes('providers/rpc')).toBe(false);
      expect(source.includes('providers/sourcify')).toBe(false);
      for (const match of source.matchAll(importRe)) {
        const spec = match[1];
        if (!spec) {
          continue;
        }
        const resolved = j(
          dir(file),
          spec.endsWith('.js') ? spec.replace(/\.js$/, '.ts') : `${spec}.ts`
        );
        try {
          read(resolved);
          queue.push(resolved);
        } catch {
          // skip missing (json, etc.)
        }
      }
    }
  });
});

describe('offchainAttestationUid', () => {
  it('hashes schema as UTF-8 of the hex string', () => {
    const uid = offchainAttestationUid({
      schema: ERC8176_SCHEMA_UID,
      recipient: zeroAddress,
      time: 1n,
      expirationTime: 0n,
      revocable: true,
      refUID: zeroHash,
      data: zeroHash,
      salt: zeroHash,
    });
    const expected = keccak256(
      encodePacked(
        [
          'uint16',
          'bytes',
          'address',
          'address',
          'uint64',
          'uint64',
          'bool',
          'bytes32',
          'bytes',
          'bytes32',
          'uint32',
        ],
        [
          2,
          stringToHex(ERC8176_SCHEMA_UID),
          zeroAddress,
          zeroAddress,
          1n,
          0n,
          true,
          zeroHash,
          zeroHash,
          zeroHash,
          0,
        ]
      )
    );
    expect(uid).toBe(expected);
  });
});
