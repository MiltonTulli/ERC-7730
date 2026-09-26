import { describe, expect, it } from 'vitest';
import { decodeTypedData } from '../decode/decodeTypedData.js';
import { createOfficialRegistry } from '../official-registry/index.js';
import { officialOrLocalPolicy } from '../trust/policy.js';
import type { InputDescriptor } from '../types/descriptor.js';

const VERIFYING = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;

const domainOnlyDescriptor: InputDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    $id: 'DomainOnlyPermit',
    eip712: {
      domain: { name: 'DomainOnlyPermit', version: '1', chainId: 1 },
    },
  },
  metadata: {
    owner: 'Test',
    contractName: 'DomainOnlyPermit',
    info: { url: 'https://example.com/', deploymentDate: '2020-01-01T00:00:00Z' },
  },
  display: {
    formats: {
      'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)': {
        intent: 'Permit domain-only',
        fields: [
          { path: 'spender', label: 'Spender', format: 'addressName' },
          { path: 'value', label: 'Value', format: 'raw' },
        ],
      },
    },
  },
};

const typedData = {
  account: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Permit' as const,
  domain: {
    name: 'DomainOnlyPermit',
    version: '1',
    chainId: 1,
    verifyingContract: VERIFYING,
  },
  message: {
    owner: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    spender: '0x1111111111111111111111111111111111111111',
    value: 1n,
    nonce: 0n,
    deadline: 2_000_000_000n,
  },
};

describe('EIP-712 domain / domainSeparator binding', () => {
  it('matches an extend() override that binds only via context.eip712.domain', async () => {
    const registry = createOfficialRegistry({
      pin: '9f37816afde954ff6617fb5baa346133e5af26c5',
      fetch: async () => new Response('{}', { status: 200 }),
      indexes: { calldata: {}, eip712: {} },
    });
    registry.extend([domainOnlyDescriptor]);

    const result = await decodeTypedData(typedData, {
      registry,
      trust: officialOrLocalPolicy(),
    });

    expect(result.source).toBe('local-override');
    expect(result.intent).toBe('Permit domain-only');
    expect(result.confidence).toBe('medium');
  });

  it('falls through to inferred when the domain does not match', async () => {
    const registry = createOfficialRegistry({
      pin: '9f37816afde954ff6617fb5baa346133e5af26c5',
      fetch: async () => new Response('{}', { status: 200 }),
      indexes: { calldata: {}, eip712: {} },
    });
    registry.extend([domainOnlyDescriptor]);

    const result = await decodeTypedData(
      {
        ...typedData,
        domain: { ...typedData.domain, name: 'OtherName' },
      },
      { registry, trust: officialOrLocalPolicy() }
    );

    expect(result.source).toBe('inferred');
    expect(result.confidence).toBe('low');
  });

  it('createOfficialRegistry findEip712 forwards typedData for domain overrides', async () => {
    const registry = createOfficialRegistry({
      pin: '9f37816afde954ff6617fb5baa346133e5af26c5',
      fetch: async () => new Response('{}', { status: 200 }),
      indexes: { calldata: {}, eip712: {} },
    });
    registry.extend([domainOnlyDescriptor]);

    const found = await registry.findEip712({
      chainId: 1,
      address: VERIFYING,
      signature: 'Permit',
      typedData,
    });
    expect(found).not.toBeNull();
    expect(found?.source).toBe('local-override');

    const missed = await registry.findEip712({
      chainId: 1,
      address: VERIFYING,
      signature: 'Permit',
      typedData: {
        ...typedData,
        domain: { ...typedData.domain, name: 'Nope' },
      },
    });
    expect(missed).toBeNull();
  });
});
