import { readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DescriptorResolveError,
  createMemoryIncludeLoader,
  descriptorHash,
  resolveDescriptor,
} from '../resolve/index.js';
import { collectFieldRefs } from '../resolve/refs.js';
import type { IncludeLoader, InputDescriptor } from '../types/descriptor.js';

const here = dirname(fileURLToPath(import.meta.url));
const officialDir = join(here, 'fixtures/official');
const includesDir = join(here, 'fixtures/includes');
const registryDir = join(here, '../../../registry/descriptors');

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fileLoader(baseDir: string): IncludeLoader {
  const origins = new WeakMap<object, string>();
  return {
    async load(ref, from) {
      const fromPath = origins.get(from as object);
      const dir = fromPath ? dirname(fromPath) : baseDir;
      const resolved = resolvePath(dir, ref);
      const json: unknown = JSON.parse(readFileSync(resolved, 'utf8'));
      if (json && typeof json === 'object') {
        origins.set(json as object, resolved);
      }
      return json;
    },
  };
}

describe('resolveDescriptor', () => {
  it('resolves an official Safe descriptor that uses common-*.json', async () => {
    const input = loadJson(join(officialDir, 'safe-calldata-Safe-1.4.1.json')) as InputDescriptor;
    const commonSafe = loadJson(join(includesDir, 'common-Safe.json'));
    const resolved = await resolveDescriptor(
      input,
      createMemoryIncludeLoader({ 'common-Safe.json': commonSafe })
    );

    expect(resolved.version).toBe('2');
    expect(resolved.merged.includes).toBeUndefined();
    expect(resolved.input.includes).toBe('common-Safe.json');
    expect(resolved.merged.metadata).toMatchObject({
      owner: 'Safe{Wallet}',
      contractName: 'Safe',
    });
    expect(resolved.merged.display).toMatchObject({
      formats: {
        'execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)':
          {
            intent: 'sign multisig operation',
          },
      },
    });
    expect(collectFieldRefs(resolved.merged)).toEqual([]);
    expect(resolved.deployments.length).toBeGreaterThan(0);
    expect(resolved.deployments[0]).toEqual({
      chainId: 1,
      address: '0x41675c099f32341bf84bfc5382af534df5c7461a',
    });
    expect(resolved.deployments.every((item) => item.address === item.address.toLowerCase())).toBe(
      true
    );
  });

  it('inlines $.display.definitions $ref from a common include (1inch)', async () => {
    const inchDir = join(registryDir, '1inch');
    const input = loadJson(join(inchDir, 'calldata-AggregationRouterV6.json')) as InputDescriptor;
    const resolved = await resolveDescriptor(input, fileLoader(inchDir));

    expect(resolved.merged.includes).toBeUndefined();
    expect(collectFieldRefs(resolved.merged)).toEqual([]);

    const display = resolved.merged.display as {
      formats: Record<string, { fields: Array<Record<string, unknown>> }>;
    };
    const clipper =
      display.formats[
        'clipperSwap(address clipperExchange, uint256 srcToken, address dstToken, uint256 inputAmount, uint256 outputAmount, uint256 goodUntil, bytes32 r, bytes32 vs)'
      ];
    expect(clipper).toBeDefined();
    const send = clipper.fields.find((field) => field.path === 'inputAmount');
    expect(send).toMatchObject({
      path: 'inputAmount',
      label: 'Amount to Send',
      format: 'tokenAmount',
      params: {
        tokenPath: 'srcToken.[-20:]',
      },
    });
    expect(send?.$ref).toBeUndefined();
  });

  it('merges fields that share a path (EIP overlay)', async () => {
    const included: InputDescriptor = {
      $schema: '../../specs/erc7730-v2.schema.json',
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
                params: { tokenPath: '@.to', threshold: '0x80' },
              },
            ],
          },
        },
      },
    };
    const input: InputDescriptor = {
      $schema: '../../specs/erc7730-v2.schema.json',
      includes: 'common.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' }],
        },
      },
      display: {
        formats: {
          'approve(address spender,uint256 value)': {
            fields: [{ path: 'value', params: { threshold: '0xFF' } }],
          },
        },
      },
    };

    const resolved = await resolveDescriptor(
      input,
      createMemoryIncludeLoader({ 'common.json': included })
    );
    const display = resolved.merged.display as {
      formats: Record<string, { intent?: string; fields: Array<Record<string, unknown>> }>;
    };
    const format = display.formats['approve(address spender,uint256 value)'];
    expect(format.intent).toBe('Approve');
    expect(format.fields).toEqual([
      { path: 'spender', label: 'Spender', format: 'addressName' },
      {
        path: 'value',
        label: 'Amount',
        format: 'tokenAmount',
        params: { tokenPath: '@.to', threshold: '0xFF' },
      },
    ]);
  });

  it('inlines field $ref and leaves enum params.$ref', async () => {
    const input: InputDescriptor = {
      $schema: '../../specs/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0x0000000000000000000000000000000000000001' }],
        },
      },
      metadata: { enums: { mode: { '1': 'stable', '2': 'variable' } } },
      display: {
        definitions: {
          amount: { label: 'Amount', format: 'tokenAmount' },
        },
        formats: {
          'repay(uint256 amount,uint256 mode)': {
            fields: [
              { path: 'amount', $ref: '$.display.definitions.amount' },
              {
                path: 'mode',
                label: 'Mode',
                format: 'enum',
                params: { $ref: '$.metadata.enums.mode' },
              },
            ],
          },
        },
      },
    };

    const resolved = await resolveDescriptor(input, createMemoryIncludeLoader({}));
    const display = resolved.merged.display as {
      formats: Record<string, { fields: Array<Record<string, unknown>> }>;
    };
    const fields = display.formats['repay(uint256 amount,uint256 mode)'].fields;
    expect(fields[0]).toEqual({ path: 'amount', label: 'Amount', format: 'tokenAmount' });
    expect(fields[1]).toMatchObject({
      path: 'mode',
      params: { $ref: '$.metadata.enums.mode' },
    });
    expect(collectFieldRefs(resolved.merged)).toEqual([]);
  });

  it('throws on a circular include', async () => {
    const a: InputDescriptor = {
      $schema: '../../specs/erc7730-v2.schema.json',
      includes: 'b.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0x0000000000000000000000000000000000000001' }],
        },
      },
    };
    const b: InputDescriptor = {
      $schema: '../../specs/erc7730-v2.schema.json',
      includes: 'a.json',
    };
    await expect(
      resolveDescriptor(a, createMemoryIncludeLoader({ 'a.json': a, 'b.json': b }))
    ).rejects.toBeInstanceOf(DescriptorResolveError);
  });

  it('throws when an include is missing', async () => {
    const input: InputDescriptor = {
      $schema: '../../specs/erc7730-v2.schema.json',
      includes: 'missing.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0x0000000000000000000000000000000000000001' }],
        },
      },
    };
    await expect(resolveDescriptor(input, createMemoryIncludeLoader({}))).rejects.toThrow(
      /missing.json/
    );
  });
});

describe('descriptorHash', () => {
  it('is stable for key order and checksum address case', () => {
    const a: InputDescriptor = {
      context: {
        contract: {
          deployments: [{ address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', chainId: 1 }],
        },
      },
      metadata: { owner: 'Tether', contractName: 'USDT' },
    };
    const b: InputDescriptor = {
      metadata: { contractName: 'USDT', owner: 'Tether' },
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0xdac17f958d2ee523a2206206994597c13d831ec7' }],
        },
      },
    };
    expect(descriptorHash(a)).toBe(descriptorHash(b));
    expect(descriptorHash(a)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('snapshots the official Safe merged hash', async () => {
    const input = loadJson(join(officialDir, 'safe-calldata-Safe-1.4.1.json')) as InputDescriptor;
    const commonSafe = loadJson(join(includesDir, 'common-Safe.json'));
    const resolved = await resolveDescriptor(
      input,
      createMemoryIncludeLoader({ 'common-Safe.json': commonSafe })
    );
    expect(resolved.hash).toBe(descriptorHash(resolved.merged));
    expect(resolved.hash).toMatchInlineSnapshot(
      `"0xea12a43034f01ce3a9eeb3aa7d9330b2e9343c2a60a0b0f9098c09ff917cd2dc"`
    );
  });
});
