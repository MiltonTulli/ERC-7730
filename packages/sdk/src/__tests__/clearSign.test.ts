import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSign, sharedClearSignRegistry } from '../clearSign';
import { createClearSigner } from '../core/ClearSigner';
import { decodeTransaction } from '../decode/decodeTransaction';
import type { ClearSignEvent, DecodeRegistry } from '../decode/types';
import { createOfficialRegistry } from '../official-registry';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve';
import { toScreens } from '../screens';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor';

const here = dirname(fileURLToPath(import.meta.url));
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const VITALIK = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
const TRANSFER =
  `0xa9059cbb000000000000000000000000${VITALIK}0000000000000000000000000000000000000000000000000000000005f5e100` as const;

const wethJson = JSON.parse(
  readFileSync(join(here, 'fixtures/official/weth-calldata-weth.json'), 'utf8')
) as InputDescriptor;

const usdcDescriptor: InputDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    contract: { deployments: [{ chainId: 1, address: USDC }] },
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
        fields: [
          { path: 'to', label: 'Recipient', format: 'addressName' },
          { path: 'value', label: 'Amount', format: 'tokenAmount', params: { tokenPath: '@.to' } },
        ],
      },
      'approve(address spender,uint256 value)': {
        intent: 'Approve',
        fields: [{ path: 'spender', label: 'Spender', format: 'addressName' }],
      },
    },
  },
};

async function registryOf(resolved: ResolvedDescriptor, address: string): Promise<DecodeRegistry> {
  return {
    async findCalldata(key) {
      if (key.chainId === 1 && key.address.toLowerCase() === address.toLowerCase()) {
        return { ...resolved, source: 'official-registry' };
      }
      return null;
    },
  };
}

describe('diagnostics', () => {
  it('reports REGISTRY_NO_DESCRIPTOR when lookup misses', async () => {
    const registry: DecodeRegistry = {
      async findCalldata() {
        return null;
      },
    };
    const result = await decodeTransaction(
      { to: '0x1111111111111111111111111111111111111111', data: '0xdeadbeef', chainId: 1 },
      { registry, provider: null, builtins: false }
    );
    expect(result.diagnostics.some((item) => item.code === 'REGISTRY_NO_DESCRIPTOR')).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('reports CHAIN_ID_MISMATCH when deployments omit the chain', async () => {
    const resolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
    const registry: DecodeRegistry = {
      async findCalldata() {
        return { ...resolved, source: 'official-registry' };
      },
    };
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER, chainId: 10 },
      { registry, provider: null, builtins: false }
    );
    expect(result.diagnostics.some((item) => item.code === 'CHAIN_ID_MISMATCH')).toBe(true);
  });

  it('reports SELECTOR_NOT_IN_FORMATS when the selector is absent', async () => {
    const resolved = await resolveDescriptor(wethJson, createMemoryIncludeLoader({}));
    const registry = await registryOf(resolved, WETH);
    const result = await decodeTransaction(
      { to: WETH, data: '0xdeadbeef', chainId: 1 },
      { registry, provider: null, builtins: false }
    );
    expect(result.diagnostics.some((item) => item.code === 'SELECTOR_NOT_IN_FORMATS')).toBe(true);
  });

  it('reports INCLUDE_FETCH_FAILED when the registry throws', async () => {
    const registry: DecodeRegistry = {
      async findCalldata() {
        throw new Error('include 404');
      },
    };
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER, chainId: 1 },
      { registry, provider: null, builtins: false }
    );
    const failure = result.diagnostics.find((item) => item.code === 'INCLUDE_FETCH_FAILED');
    expect(failure?.outcome).toBe('error');
    expect(failure?.stage).toBe('include-resolve');
  });

  it('reports POLICY_REJECTED when the policy refuses the descriptor', async () => {
    const resolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
    const registry: DecodeRegistry = {
      async findCalldata() {
        return { ...resolved, source: 'local-override' };
      },
    };
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER, chainId: 1 },
      { registry, provider: null }
    );
    expect(result.trust.accepted).toBe(false);
    expect(result.diagnostics.some((item) => item.code === 'POLICY_REJECTED')).toBe(true);
  });

  it('reports VERIFIED_ABI_FAILED when the ABI loader throws', async () => {
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER, chainId: 1 },
      {
        provider: null,
        builtins: false,
        useSourcifyFallback: true,
        async loadVerifiedAbi() {
          throw new Error('sourcify down');
        },
      }
    );
    expect(result.diagnostics.some((item) => item.code === 'VERIFIED_ABI_FAILED')).toBe(true);
    expect(result.source).not.toBe('sourcify');
  });

  it('reports SPENDER_LOOKUP_FAILED without failing an approval decode', async () => {
    const registry: DecodeRegistry = {
      async findCalldata() {
        throw new Error('spender index down');
      },
    };
    const approve =
      '0x095ea7b300000000000000000000000011111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000001';
    const result = await decodeTransaction(
      { to: USDC, data: approve, chainId: 1 },
      { registry, provider: null, builtins: false }
    );
    expect(result.diagnostics.some((item) => item.code === 'SPENDER_LOOKUP_FAILED')).toBe(true);
    expect(result.intent.length).toBeGreaterThan(0);
  });
});

describe('toScreens', () => {
  it('puts explicit required fields first and leaves implicit ones secondary', async () => {
    const resolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
    const transfer = (
      resolved.merged.display as {
        formats: Record<string, { required?: string[] }>;
      }
    ).formats['transfer(address to,uint256 value)'];
    if (transfer) {
      transfer.required = ['value'];
    }
    const result = await decodeTransaction(
      { to: USDC, data: TRANSFER, chainId: 1 },
      { registry: await registryOf(resolved, USDC), provider: null }
    );
    const screens = toScreens(result);
    expect(screens.verification).toBe('verified');
    expect(screens.headline).toBe('Send');
    expect(screens.primary.map((field) => field.label)).toEqual(['Amount']);
    expect(screens.secondary.map((field) => field.label)).toContain('Recipient');
    const amount = result.fields.find((field) => field.format === 'tokenAmount');
    expect(amount?.format === 'tokenAmount' ? amount.details.amount : 0n).toBe(100000000n);
    expect(amount?.format === 'tokenAmount' ? amount.details.token?.symbol : '').toBe('USDC');
  });

  it('prefixes unverified headlines and shows to plus selector', async () => {
    const result = await decodeTransaction(
      { to: '0x2222222222222222222222222222222222222222', data: '0xdeadbeef', chainId: 1 },
      { provider: null, builtins: false }
    );
    const screens = toScreens(result);
    expect(screens.verification).toBe('unverified');
    expect(screens.headline.startsWith('Unverified: ')).toBe(true);
    expect(screens.primary.map((field) => field.label)).toEqual(['To', 'Selector']);
    expect(screens.primary[1]?.value).toBe('0xdeadbeef');
    const custom = toScreens(result, { unverifiedPrefix: 'Review: ' });
    expect(custom.headline.startsWith('Review: ')).toBe(true);
  });
});

describe('clearSign', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes a WETH deposit with no options against the pinned registry', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(String(url));
      if (String(url).includes('index.calldata.json')) {
        return Response.json({
          'eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'registry/weth/calldata-weth.json',
        });
      }
      if (String(url).includes('calldata-weth.json')) {
        return Response.json(wethJson);
      }
      return new Response('missing', { status: 404 });
    });

    const tx = { to: WETH, data: '0xd0e30db0' as const, value: 10n ** 18n, chainId: 1 };
    const first = await clearSign(tx);
    const fetchesAfterFirst = fetched.length;
    const second = await clearSign(tx);

    expect(first.source).toBe('official-registry');
    expect(first.confidence).toBe('high');
    expect(first.trust.accepted).toBe(true);
    expect(first.screens.verification).toBe('verified');
    expect(first.screens.headline).toBe('Wrap');
    expect(second.intent).toBe('Wrap');
    expect(fetched.length).toBe(fetchesAfterFirst);
    expect(sharedClearSignRegistry()).toBe(sharedClearSignRegistry());
  });

  it('dispatches typed data, batches, and user operations', async () => {
    const resolved = await resolveDescriptor(usdcDescriptor, createMemoryIncludeLoader({}));
    const registry = await registryOf(resolved, USDC);
    const typed = await clearSign(
      {
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'value', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        domain: { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: USDC },
        message: { owner: `0x${VITALIK}`, value: 1n },
      },
      { registry, provider: null }
    );
    expect(typed.intent).toContain('Sign');
    expect(typed.screens.verificationLabel.length).toBeGreaterThan(0);

    const batch = await clearSign(
      {
        chainId: 1,
        calls: [{ to: USDC, data: TRANSFER, chainId: 1 }],
      },
      { registry, provider: null }
    );
    expect(batch.calls).toHaveLength(1);
    expect(batch.screens.children).toHaveLength(1);
    expect(batch.screens.verification).toBe('verified');

    const userOp = await clearSign(
      {
        chainId: 1,
        sender: '0x3333333333333333333333333333333333333333',
        callData: '0xdeadbeef',
      },
      { provider: null, builtins: false }
    );
    expect(userOp.screens.headline.startsWith('Unverified: ')).toBe(true);
  });

  it('uses the same clearSign contract on createClearSigner', async () => {
    const resolved = await resolveDescriptor(wethJson, createMemoryIncludeLoader({}));
    const signer = createClearSigner({
      provider: null,
      registry: await registryOf(resolved, WETH),
    });
    const signed = await signer.clearSign({
      to: WETH,
      data: '0xd0e30db0',
      value: 10n ** 18n,
      chainId: 1,
    });
    expect(signed.screens.verification).toBe('verified');
    expect(signed.intent).toBe('Wrap');
  });
});

describe('onEvent', () => {
  it('counts a cache miss and then a hit', async () => {
    let fetches = 0;
    const registry = createOfficialRegistry({
      fetch: async (url) => {
        fetches += 1;
        const href = String(url);
        if (href.includes('index.calldata.json')) {
          return Response.json({
            'eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2':
              'registry/weth/calldata-weth.json',
          });
        }
        if (href.includes('calldata-weth.json')) {
          return Response.json(wethJson);
        }
        return new Response('missing', { status: 404 });
      },
    });
    const tx = { to: WETH, data: '0xd0e30db0' as const, value: 10n ** 18n, chainId: 1 };
    const firstEvents: ClearSignEvent[] = [];
    const secondEvents: ClearSignEvent[] = [];
    await decodeTransaction(tx, {
      registry,
      provider: null,
      onEvent: (event) => firstEvents.push(event),
    });
    await decodeTransaction(tx, {
      registry,
      provider: null,
      onEvent: (event) => secondEvents.push(event),
    });

    expect(fetches).toBeGreaterThan(0);
    expect(firstEvents.some((event) => event.type === 'registry:fetch')).toBe(true);
    expect(firstEvents.some((event) => event.type === 'decode:start')).toBe(true);
    expect(firstEvents.some((event) => event.type === 'decode:end' && event.durationMs >= 0)).toBe(
      true
    );
    expect(firstEvents.some((event) => event.type === 'trust:accepted')).toBe(true);
    expect(secondEvents.some((event) => event.type === 'registry:cache-hit')).toBe(true);
    expect(secondEvents.some((event) => event.type === 'registry:fetch')).toBe(false);
  });
});
