import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import type { TrustContext, TrustPolicy } from '../decode/types.js';
import { createOfficialRegistry } from '../official-registry/index.js';
import { fetchFromSourcify } from '../providers/sourcify.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import { composePolicies, officialOnlyPolicy, officialOrLocalPolicy } from '../trust/index.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';

async function sourcifyLoader(chainId: number, address: `0x${string}`) {
  const result = await fetchFromSourcify(chainId, address);
  if (!result.verified || !result.abi) {
    return null;
  }
  return { abi: result.abi, name: result.name || undefined };
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const PIN = '9f37816afde954ff6617fb5baa346133e5af26c5';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const VITALIK = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
const HASH = /^0x[0-9a-f]{64}$/i;

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
    },
    'index.eip712.json': {},
    'registry/usdc/calldata-usdc.json': usdcDescriptor,
    'registry/weth/calldata-weth.json': loadJson(
      join(fixtures, 'official/weth-calldata-weth.json')
    ),
  };
}

function officialRegistry() {
  return createOfficialRegistry({
    pin: PIN,
    fetch: mockFetch(officialFiles()),
  });
}

function ctx(source: TrustContext['source'], descriptor?: ResolvedDescriptor): TrustContext {
  return { source, chainId: 1, address: USDC, descriptor };
}

const denyAll: TrustPolicy = {
  id: 'deny-all',
  evaluate(inner) {
    return {
      accepted: false,
      policy: 'deny-all',
      descriptorHash: inner.descriptor?.hash,
      reasons: ['denied'],
    };
  },
};

describe('officialOnlyPolicy', () => {
  it('accepts official-registry and attested; rejects the rest', async () => {
    const policy = officialOnlyPolicy();
    expect(policy.id).toBe('official-only');

    const official = await policy.evaluate(ctx('official-registry'));
    expect(official.accepted).toBe(true);
    expect(official.policy).toBe('official-only');
    expect(official.reasons.length).toBeGreaterThan(0);

    expect((await policy.evaluate(ctx('attested'))).accepted).toBe(true);
    expect((await policy.evaluate(ctx('local-override'))).accepted).toBe(false);
    expect((await policy.evaluate(ctx('sourcify'))).accepted).toBe(false);
    expect((await policy.evaluate(ctx('generated'))).accepted).toBe(false);
    expect((await policy.evaluate(ctx('inferred'))).accepted).toBe(false);
    expect((await policy.evaluate(ctx('basic'))).accepted).toBe(false);

    const sourcify = await policy.evaluate(ctx('sourcify'));
    expect(sourcify.reasons).toContain('untrusted_descriptor');
  });
});

describe('officialOrLocalPolicy', () => {
  it('accepts official-registry, attested, and local-override', async () => {
    const policy = officialOrLocalPolicy();
    expect(policy.id).toBe('official-or-local');
    expect((await policy.evaluate(ctx('official-registry'))).accepted).toBe(true);
    expect((await policy.evaluate(ctx('local-override'))).accepted).toBe(true);
    expect((await policy.evaluate(ctx('sourcify'))).accepted).toBe(false);
    expect((await policy.evaluate(ctx('basic'))).accepted).toBe(false);
  });
});

describe('composePolicies', () => {
  it('all requires every child to accept; any accepts if one does', async () => {
    const official = officialOnlyPolicy();
    const all = composePolicies([official, denyAll], 'all');
    const any = composePolicies([official, denyAll], 'any');

    const inner = ctx('official-registry');
    const allReport = await all.evaluate(inner);
    const anyReport = await any.evaluate(inner);

    expect(all.id).toBe('compose:all');
    expect(any.id).toBe('compose:any');
    expect(allReport.accepted).toBe(false);
    expect(allReport.reasons).toContain('denied');
    expect(anyReport.accepted).toBe(true);
    expect(anyReport.reasons).toContain('source "official-registry" accepted');
  });

  it('rejects an empty compose and an unknown mode', async () => {
    const empty = composePolicies([], 'any');
    const report = await empty.evaluate(ctx('official-registry'));
    expect(report.accepted).toBe(false);
    expect(report.reasons).toContain('no policies to compose');
    expect(() => composePolicies([], 'maybe' as 'all')).toThrow(/all" or "any"/);
  });
});

describe('decodeTransaction + TrustPolicy', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('accepts a pinned official USDC transfer under officialOnlyPolicy', async () => {
    const registry = officialRegistry();
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry,
        provider: null,
        useSourcifyFallback: false,
        trust: officialOnlyPolicy(),
      }
    );

    expect(result.source).toBe('official-registry');
    expect(result.confidence).toBe('high');
    expect(result.trust.accepted).toBe(true);
    expect(result.trust.policy).toBe('official-only');
    expect(result.trust.descriptorHash).toMatch(HASH);
    expect(result.trust.reasons.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.type === 'untrusted_descriptor')).toBe(false);
  });

  it('rejects a Sourcify-only path under officialOnlyPolicy', async () => {
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
              name: 'transfer',
              inputs: [
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
              ],
              stateMutability: 'nonpayable',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        trust: officialOnlyPolicy(),
        provider: null,
        useSourcifyFallback: true,
        loadVerifiedAbi: sourcifyLoader,
      }
    );

    expect(result.source).toBe('sourcify');
    expect(result.trust.accepted).toBe(false);
    expect(result.trust.policy).toBe('official-only');
    expect(result.trust.descriptorHash).toMatch(HASH);
    expect(result.trust.reasons).toContain('untrusted_descriptor');
    expect(result.confidence).toBe('low');
    expect(result.warnings.some((warning) => warning.type === 'untrusted_descriptor')).toBe(true);
  });

  it('lets a custom policy reject an official descriptor', async () => {
    const registry = officialRegistry();
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry,
        provider: null,
        useSourcifyFallback: false,
        trust: denyAll,
      }
    );

    expect(result.source).toBe('official-registry');
    expect(result.trust.accepted).toBe(false);
    expect(result.trust.policy).toBe('deny-all');
    expect(result.trust.reasons).toEqual(['denied']);
    expect(result.confidence).toBe('low');
    expect(result.warnings.some((warning) => warning.type === 'untrusted_descriptor')).toBe(true);
  });

  it('treats extend() hits as local-override for officialOnly vs officialOrLocal', async () => {
    const registry = officialRegistry();
    registry.extend([usdcDescriptor]);

    const only = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry,
        provider: null,
        useSourcifyFallback: false,
        trust: officialOnlyPolicy(),
      }
    );
    expect(only.source).toBe('local-override');
    expect(only.trust.accepted).toBe(false);
    expect(only.trust.policy).toBe('official-only');
    expect(only.confidence).toBe('low');

    const orLocal = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry,
        provider: null,
        useSourcifyFallback: false,
        trust: officialOrLocalPolicy(),
      }
    );
    expect(orLocal.source).toBe('local-override');
    expect(orLocal.trust.accepted).toBe(true);
    expect(orLocal.trust.policy).toBe('official-or-local');
    expect(orLocal.confidence).toBe('medium');
    expect(orLocal.trust.descriptorHash).toMatch(HASH);
  });

  it('fills descriptorHash when a custom policy omits it', async () => {
    const resolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
    const sloppy: TrustPolicy = {
      id: 'sloppy',
      evaluate() {
        return { accepted: true, policy: 'sloppy', reasons: [] };
      },
    };

    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry: {
          async findCalldata() {
            return resolved;
          },
        },
        provider: null,
        useSourcifyFallback: false,
        trust: sloppy,
      }
    );

    expect(result.trust.accepted).toBe(true);
    expect(result.trust.descriptorHash).toBe(resolved.hash);
    expect(result.trust.reasons.length).toBeGreaterThan(0);
  });

  it('does not treat a source-less custom-registry hit as official', async () => {
    const resolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER_100_USDC, chainId: 1 },
      {
        registry: {
          async findCalldata() {
            return resolved;
          },
        },
        provider: null,
        useSourcifyFallback: false,
        trust: officialOnlyPolicy(),
      }
    );

    expect(result.source).toBe('local-override');
    expect(result.trust.accepted).toBe(false);
    expect(result.trust.policy).toBe('official-only');
    expect(result.confidence).toBe('low');
    expect(result.warnings.some((warning) => warning.type === 'untrusted_descriptor')).toBe(true);
  });
});
