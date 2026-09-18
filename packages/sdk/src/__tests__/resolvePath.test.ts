import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PathResolveError, resolvePath } from '../path/index.js';
import { parsePath } from '../path/parse.js';
import type { PathContext, PathEnvelope } from '../path/types.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import type { Hex, InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';

const here = dirname(fileURLToPath(import.meta.url));
const officialDir = join(here, 'fixtures/official');

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
const ZERO = '0x0000000000000000000000000000000000000000';

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function descriptor(merged: InputDescriptor): ResolvedDescriptor {
  return {
    version: '2',
    hash: `0x${'00'.repeat(32)}` as Hex,
    input: merged,
    merged,
    deployments: [],
  };
}

const envelope: PathEnvelope = {
  from: '0x1111111111111111111111111111111111111111',
  to: STETH,
  value: 10n ** 18n,
  chainId: 1,
};

function ctx(partial: Partial<PathContext> & { args?: unknown; message?: unknown }): PathContext {
  return {
    descriptor: descriptor({ metadata: { owner: 'Test' } }),
    envelope,
    ...partial,
  };
}

describe('parsePath', () => {
  it.each([
    ['#.amount', { root: 'data', absolute: true, names: ['amount'] }],
    ['amount', { root: 'data', absolute: false, names: ['amount'] }],
    ['_to', { root: 'data', absolute: false, names: ['_to'] }],
    [
      '$.metadata.enums.interestRateMode',
      { root: 'descriptor', absolute: true, names: ['metadata', 'enums', 'interestRateMode'] },
    ],
    ['@.value', { root: 'container', absolute: true, names: ['value'] }],
    ['params.path.[0:20]', { root: 'data', absolute: false, names: ['params', 'path'] }],
  ] as const)('parses %s', (path, expected) => {
    const parsed = parsePath(path);
    expect(parsed.root).toBe(expected.root);
    expect(parsed.absolute).toBe(expected.absolute);
    expect(parsed.segments.filter((s) => s.type === 'field').map((s) => s.name)).toEqual([
      ...expected.names,
    ]);
  });

  it('parses dotted and compact array selectors', () => {
    expect(parsePath('pools.[-1]').segments).toEqual([
      { type: 'field', name: 'pools' },
      { type: 'index', index: -1 },
    ]);
    expect(parsePath('tokens[0]').segments).toEqual([
      { type: 'field', name: 'tokens' },
      { type: 'index', index: 0 },
    ]);
    expect(parsePath('details.[]').segments).toEqual([
      { type: 'field', name: 'details' },
      { type: 'all' },
    ]);
    expect(parsePath('path.[-20:]').segments).toEqual([
      { type: 'field', name: 'path' },
      { type: 'slice', start: -20, end: undefined },
    ]);
    expect(parsePath('data[:32]').segments).toEqual([
      { type: 'field', name: 'data' },
      { type: 'slice', start: undefined, end: 32 },
    ]);
  });

  it('rejects invalid syntax', () => {
    expect(() => parsePath('')).toThrow(PathResolveError);
    expect(() => parsePath('#')).toThrow(/Root must be followed/);
    expect(() => parsePath('@.nonce')).toThrow(/Unknown container field/);
    expect(() => parsePath('$.foo.[]')).toThrow(/field names and \[index\] only/);
    expect(() => parsePath('foo.[1:2:3]')).toThrow(/must not include a step/);
    expect(() => parsePath('#.foo.')).toThrow(/Empty path component/);
  });
});

describe('resolvePath', () => {
  describe('#. structured data', () => {
    it('reads a top-level decoded argument', () => {
      expect(resolvePath('#.amount', ctx({ args: { amount: 100n } }))).toBe(100n);
      expect(resolvePath('amount', ctx({ args: { amount: 100n } }))).toBe(100n);
    });

    it('reads nested tuple / struct children (#.tupleField.child)', () => {
      const args = { tupleField: { child: '0xabc', nested: { ok: true } } };
      expect(resolvePath('#.tupleField.child', ctx({ args }))).toBe('0xabc');
      expect(resolvePath('#.tupleField.nested.ok', ctx({ args }))).toBe(true);
    });

    it('reads EIP-712 message fields', () => {
      const message = { owner: USDC, spender: WETH, value: 1n, deadline: 2n };
      expect(resolvePath('#.spender', ctx({ message }))).toBe(WETH);
      expect(resolvePath('value', ctx({ message }))).toBe(1n);
    });

    it('prefers args over message when both are set', () => {
      expect(resolvePath('#.x', ctx({ args: { x: 'args' }, message: { x: 'message' } }))).toBe(
        'args'
      );
    });

    it('indexes arrays and negative last-element (pools.[-1])', () => {
      const args = { pools: ['a', 'b', 'c'] };
      expect(resolvePath('#.pools.[0]', ctx({ args }))).toBe('a');
      expect(resolvePath('#.pools.[-1]', ctx({ args }))).toBe('c');
      expect(resolvePath('#.pools.[]', ctx({ args }))).toEqual(['a', 'b', 'c']);
    });

    it('maps [].field across an array (PermitBatch details.[].amount)', () => {
      const args = {
        details: [
          { token: USDC, amount: 1n },
          { token: WETH, amount: 2n },
        ],
      };
      expect(resolvePath('#.details.[].amount', ctx({ args }))).toEqual([1n, 2n]);
      expect(resolvePath('#.details.[].token', ctx({ args }))).toEqual([USDC, WETH]);
    });

    it('slices a packed Uniswap V3 bytes path (params.path.[0:20] / [-20:])', () => {
      // tokenIn (20) + fee 3000 (3) + tokenOut (20)
      const packed = `${USDC}000bb8${WETH.slice(2)}`.toLowerCase() as `0x${string}`;
      const args = { params: { path: packed, amountIn: 1n } };
      expect(resolvePath('#.params.path.[0:20]', ctx({ args }))).toBe(USDC.toLowerCase());
      expect(resolvePath('#.params.path.[-20:]', ctx({ args }))).toBe(WETH.toLowerCase());
      expect(resolvePath('params.path.[0:20]', ctx({ args }))).toBe(USDC.toLowerCase());
    });

    it('slices last 20 bytes of a uint256 (1inch srcToken.[-20:])', () => {
      const word = BigInt(USDC);
      expect(resolvePath('#.srcToken.[-20:]', ctx({ args: { srcToken: word } }))).toBe(
        USDC.toLowerCase()
      );
    });

    it('treats numeric field names as indexes on positional tuples', () => {
      expect(resolvePath('#.0', ctx({ args: [STETH, 5n] }))).toBe(STETH);
      expect(resolvePath('#.1', ctx({ args: [STETH, 5n] }))).toBe(5n);
    });
  });

  describe('$. merged descriptor', () => {
    it('reads metadata.enums.* (Aave interestRateMode)', async () => {
      const input = loadJson(join(officialDir, 'aave-calldata-lpv3.json')) as InputDescriptor;
      const resolved = await resolveDescriptor(input, createMemoryIncludeLoader({}));
      const rates = resolvePath('$.metadata.enums.interestRateMode', ctx({ descriptor: resolved }));
      expect(rates).toEqual({ '0': 'none', '1': 'deprecated', '2': 'variable' });
      expect(resolvePath('$.metadata.constants.max', ctx({ descriptor: resolved }))).toBe(
        '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe'
      );
    });

    it('reads constants used as token addresses (Lido stETH)', async () => {
      const input = loadJson(join(officialDir, 'lido-calldata-stETH.json')) as InputDescriptor;
      const resolved = await resolveDescriptor(input, createMemoryIncludeLoader({}));
      expect(resolvePath('$.metadata.constants.stETHaddress', ctx({ descriptor: resolved }))).toBe(
        STETH
      );
    });

    it('indexes descriptor arrays with [index]', () => {
      const merged: InputDescriptor = {
        context: {
          contract: {
            deployments: [
              { chainId: 1, address: USDC },
              { chainId: 137, address: WETH },
            ],
          },
        },
      };
      expect(
        resolvePath(
          '$.context.contract.deployments.[0].address',
          ctx({ descriptor: descriptor(merged) })
        )
      ).toBe(USDC);
    });
  });

  describe('@. envelope', () => {
    it('reads @.to / @.value / @.chainId / @.from', () => {
      expect(resolvePath('@.to', ctx({}))).toBe(STETH);
      expect(resolvePath('@.value', ctx({}))).toBe(10n ** 18n);
      expect(resolvePath('@.chainId', ctx({}))).toBe(1);
      expect(resolvePath('@.from', ctx({}))).toBe(envelope.from);
    });

    it('reads Lido-style submit() native amount from @.value', async () => {
      const input = loadJson(join(officialDir, 'lido-calldata-stETH.json')) as InputDescriptor;
      const resolved = await resolveDescriptor(input, createMemoryIncludeLoader({}));
      const staked = resolvePath('@.value', {
        descriptor: resolved,
        envelope: { to: STETH, value: 2n * 10n ** 18n, chainId: 1, from: envelope.from },
        args: { _referral: ZERO },
      });
      expect(staked).toBe(2n * 10n ** 18n);
      expect(
        resolvePath('#._referral', {
          descriptor: resolved,
          envelope: { to: STETH, value: 2n * 10n ** 18n, chainId: 1 },
          args: { _referral: ZERO },
        })
      ).toBe(ZERO);
    });

    it('reads WETH deposit() amount from @.value', async () => {
      const input = loadJson(join(officialDir, 'weth-calldata-weth.json')) as InputDescriptor;
      const resolved = await resolveDescriptor(input, createMemoryIncludeLoader({}));
      expect(
        resolvePath('@.value', {
          descriptor: resolved,
          envelope: { to: WETH, value: 5n * 10n ** 17n, chainId: 1 },
        })
      ).toBe(5n * 10n ** 17n);
    });
  });

  describe('relative tokenPath / collectionPath', () => {
    it('resolves a sibling tokenPath from the structured-data root', () => {
      const args = { asset: USDC, amount: 1_000_000n };
      expect(resolvePath('asset', ctx({ args }))).toBe(USDC);
      expect(resolvePath('tokenPath', ctx({ args: { tokenPath: 'nope', asset: USDC } }))).toBe(
        'nope'
      );
    });

    it('resolves tokenPath relative to a nested field group (Permit2 details)', () => {
      const args = {
        details: [
          { token: USDC, amount: 10n },
          { token: WETH, amount: 20n },
        ],
        spender: ZERO,
      };
      expect(resolvePath('token', ctx({ args, base: '#.details.[0]' }))).toBe(USDC);
      expect(resolvePath('token', ctx({ args, base: '#.details.[-1]' }))).toBe(WETH);
      expect(resolvePath('token', ctx({ args, base: 'details.[]' }))).toEqual([USDC, WETH]);
    });

    it('does not apply base to absolute # / $ / @ children', () => {
      const args = { details: { token: USDC } };
      expect(resolvePath('@.to', ctx({ args, base: '#.details' }))).toBe(STETH);
      expect(resolvePath('#.details.token', ctx({ args, base: '#.details' }))).toBe(USDC);
    });
  });

  describe('missing / invalid paths', () => {
    it('throws PathResolveError not_found for a missing field (does not return undefined)', () => {
      try {
        resolvePath('#.missing', ctx({ args: { amount: 1n } }));
        throw new Error('should throw');
      } catch (error) {
        expect(error).toBeInstanceOf(PathResolveError);
        expect((error as PathResolveError).code).toBe('not_found');
        expect((error as PathResolveError).path).toBe('#.missing');
      }
    });

    it('throws not_found for an out-of-range index and unset envelope field', () => {
      expect(() => resolvePath('#.pools.[3]', ctx({ args: { pools: [1] } }))).toThrow(
        PathResolveError
      );
      expect(() =>
        resolvePath('@.from', ctx({ envelope: { to: STETH, value: 1n, chainId: 1 } }))
      ).toThrow(/not set/);
    });

    it('throws missing_data when #. is used without args or message', () => {
      try {
        resolvePath('#.amount', ctx({}));
        throw new Error('should throw');
      } catch (error) {
        expect(error).toBeInstanceOf(PathResolveError);
        expect((error as PathResolveError).code).toBe('missing_data');
      }
    });

    it('throws invalid for unknown roots and container fields', () => {
      expect(() => resolvePath('@.gas', ctx({}))).toThrow(/Unknown container field/);
      expect(() => resolvePath('', ctx({}))).toThrow(/non-empty string/);
    });
  });
});
