import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OfficialRegistryError,
  VENDORED_REGISTRY_COMMIT,
  createMemoryDescriptorCache,
  createOfficialRegistry,
  isCommitSha,
  toCaip10,
} from '../official-registry/index.js';
import type { InputDescriptor } from '../types/descriptor.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const PIN = '9f37816afde954ff6617fb5baa346133e5af26c5';

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const SAFE = '0x41675C099F32341bf84BFc5382aF534df5C7461a' as const;
const PERMIT_HASH = '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9' as const;

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function registryFiles(): Record<string, unknown> {
  return {
    'index.calldata.json': loadJson(join(fixtures, 'official-registry/index.calldata.json')),
    'index.eip712.json': loadJson(join(fixtures, 'official-registry/index.eip712.json')),
    'registry/weth/calldata-weth.json': loadJson(
      join(fixtures, 'official/weth-calldata-weth.json')
    ),
    'registry/safe/calldata-Safe-1.4.1.json': loadJson(
      join(fixtures, 'official/safe-calldata-Safe-1.4.1.json')
    ),
    'registry/safe/common-Safe.json': loadJson(join(fixtures, 'includes/common-Safe.json')),
    'registry/permit/eip712-permit-ethereum-usdc.json': loadJson(
      join(fixtures, 'official/permit-eip712-ethereum-usdc.json')
    ),
    'ercs/eip712-erc2612-permit.json': loadJson(
      join(fixtures, 'official-registry/ercs-eip712-erc2612-permit.json')
    ),
    'registry/circle/eip712-ReceiveWithAuthorization.json': {
      $schema: '../../specs/erc7730-v2.schema.json',
      context: {
        eip712: {
          deployments: [{ chainId: 1, address: USDC.toLowerCase() }],
        },
      },
      metadata: { owner: 'USDC' },
      display: { formats: { ReceiveWithAuthorization: { intent: 'Receive' } } },
    },
  };
}

function mockFetch(files: Record<string, unknown>, calls: string[]): typeof fetch {
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

function registry(calls: string[] = []) {
  return createOfficialRegistry({
    pin: PIN,
    fetch: mockFetch(registryFiles(), calls),
  });
}

describe('createOfficialRegistry pin', () => {
  it('throws without a pin', () => {
    expect(() => createOfficialRegistry({} as { pin: string })).toThrow(OfficialRegistryError);
  });

  it('throws on floating master/main', () => {
    expect(() => createOfficialRegistry({ pin: 'master' })).toThrow(/floating ref/);
    expect(() => createOfficialRegistry({ pin: 'main' })).toThrow(/floating ref/);
  });

  it('throws on a short or non-hex pin', () => {
    expect(() => createOfficialRegistry({ pin: '9f37816' })).toThrow(/40-character/);
  });

  it('accepts the vendored schema commit as a pin', () => {
    expect(isCommitSha(VENDORED_REGISTRY_COMMIT)).toBe(true);
    expect(VENDORED_REGISTRY_COMMIT).toBe(PIN);
  });
});

describe('toCaip10', () => {
  it('lowercases the address', () => {
    expect(toCaip10(1, WETH)).toBe('eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
  });
});

describe('findCalldata', () => {
  it('returns the official WETH descriptor for the Ethereum deployment', async () => {
    const found = await registry().findCalldata({ chainId: 1, address: WETH });
    expect(found).not.toBeNull();
    expect(found?.version).toBe('2');
    expect(found?.merged.metadata).toMatchObject({ owner: 'WETH', contractName: 'WETH' });
    expect(found?.deployments).toContainEqual({
      chainId: 1,
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    });
  });

  it('accepts a lowercase address', async () => {
    const found = await registry().findCalldata({
      chainId: 1,
      address: WETH.toLowerCase() as `0x${string}`,
    });
    expect(found?.merged.metadata).toMatchObject({ owner: 'WETH' });
  });

  it('returns null when the CAIP-10 key is absent (USDC has no calldata index entry)', async () => {
    const found = await registry().findCalldata({ chainId: 1, address: USDC });
    expect(found).toBeNull();
  });

  it('merges common-*.json includes from the same pin', async () => {
    const found = await registry().findCalldata({ chainId: 1, address: SAFE });
    expect(found).not.toBeNull();
    expect(found?.input.includes).toBe('common-Safe.json');
    expect(found?.merged.includes).toBeUndefined();
    expect(found?.merged.metadata).toMatchObject({
      owner: 'Safe{Wallet}',
      contractName: 'Safe',
    });
  });
});

describe('findEip712', () => {
  it('returns the USDC Permit descriptor when primaryType is set', async () => {
    const found = await registry().findEip712({
      chainId: 1,
      address: USDC,
      signature: 'Permit',
    });
    expect(found).not.toBeNull();
    expect(found?.merged.metadata).toMatchObject({ owner: 'USDC' });
    expect(found?.merged.display).toMatchObject({
      formats: {
        'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)': {
          intent: 'Authorize spending of tokens',
        },
      },
    });
  });

  it('selects USDC Permit by encodeTypeHash', async () => {
    const found = await registry().findEip712({
      chainId: 1,
      address: USDC,
      encodeTypeHash: PERMIT_HASH,
    });
    expect(found?.merged.display).toMatchObject({
      formats: {
        'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)': {
          intent: 'Authorize spending of tokens',
        },
      },
    });
  });

  it('returns null when several EIP-712 files match and no discriminator is given', async () => {
    const found = await registry().findEip712({ chainId: 1, address: USDC });
    expect(found).toBeNull();
  });
});

describe('extend', () => {
  it('returns a local override before the remote index', async () => {
    const client = registry();
    client.extend([
      {
        $schema: '../../specs/erc7730-v2.schema.json',
        context: {
          contract: {
            deployments: [{ chainId: 1, address: WETH }],
          },
        },
        metadata: { owner: 'Local WETH' },
        display: { formats: { 'deposit()': { intent: 'Local wrap' } } },
      } as InputDescriptor,
    ]);

    const found = await client.findCalldata({ chainId: 1, address: WETH });
    expect(found?.merged.metadata).toMatchObject({ owner: 'Local WETH' });
  });

  it('throws on an invalid override', () => {
    expect(() => registry().extend([{ metadata: { owner: 'Nope' } } as InputDescriptor])).toThrow(
      OfficialRegistryError
    );
  });
});

describe('cache', () => {
  it('does not refetch index or descriptor on a second lookup', async () => {
    const calls: string[] = [];
    const client = registry(calls);
    await client.findCalldata({ chainId: 1, address: WETH });
    const first = calls.length;
    expect(first).toBeGreaterThan(0);
    await client.findCalldata({ chainId: 1, address: WETH });
    expect(calls.length).toBe(first);
  });

  it('reuses an injected durable cache across clients', async () => {
    const files = registryFiles();
    const durable = createMemoryDescriptorCache();
    const firstCalls: string[] = [];
    const first = createOfficialRegistry({
      pin: PIN,
      cache: durable,
      fetch: mockFetch(files, firstCalls),
    });
    await first.findCalldata({ chainId: 1, address: WETH });
    expect(firstCalls.length).toBeGreaterThan(0);

    const secondCalls: string[] = [];
    const second = createOfficialRegistry({
      pin: PIN,
      cache: durable,
      fetch: mockFetch(files, secondCalls),
    });
    const found = await second.findCalldata({ chainId: 1, address: WETH });
    expect(found?.merged.metadata).toMatchObject({ owner: 'WETH' });
    expect(secondCalls).toEqual([]);
  });
});

describe('live official registry (pinned GitHub)', () => {
  it('finds WETH on Ethereum from index.calldata.json', async () => {
    const client = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT });
    try {
      const found = await client.findCalldata({ chainId: 1, address: WETH });
      expect(found).not.toBeNull();
      expect(found?.merged.metadata).toMatchObject({ owner: 'WETH' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Failed to fetch|fetch failed|ENOTFOUND|ECONNRESET/i.test(message)) {
        console.warn('Skipping live registry test:', message);
        return;
      }
      throw error;
    }
  });
});
