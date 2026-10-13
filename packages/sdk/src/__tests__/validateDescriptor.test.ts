import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateDescriptor } from '../schema/validate';
import type { InputDescriptor } from '../types/descriptor';
import type { ERC7730V2Descriptor } from '../types/v2';

const here = dirname(fileURLToPath(import.meta.url));
const officialDir = join(here, 'fixtures/official');
const v1FixturePath = join(here, 'fixtures/v1/erc20-transfer.json');

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function officialFiles(): string[] {
  return readdirSync(officialDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function asInput(descriptor: InputDescriptor): InputDescriptor {
  return descriptor;
}

function asV2(descriptor: ERC7730V2Descriptor): ERC7730V2Descriptor {
  return descriptor;
}

describe('validateDescriptor', () => {
  describe('official v2 registry fixtures', () => {
    const files = officialFiles();

    it('checks in at least 10 real registry files', () => {
      expect(files.length).toBeGreaterThanOrEqual(10);
    });

    it.each(files)('accepts %s', (name) => {
      const input = loadJson(join(officialDir, name));
      const result = validateDescriptor(input);
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true, version: '2' });
      if (result.ok) {
        asInput(result.descriptor);
        asV2(result.descriptor as ERC7730V2Descriptor);
        expect(
          result.descriptor.context !== undefined || result.descriptor.includes !== undefined
        ).toBe(true);
      }
    });
  });

  it('accepts a valid v1 document as version 1', () => {
    const input = loadJson(v1FixturePath);
    const result = validateDescriptor(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version).toBe('1');
      asInput(result.descriptor);
    }
  });

  it('accepts a valid v1 document with no $schema as version 1', () => {
    const raw = loadJson(v1FixturePath) as Record<string, unknown>;
    const withoutSchema = { ...raw };
    withoutSchema.$schema = undefined;
    const result = validateDescriptor(withoutSchema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version).toBe('1');
    }
  });

  it('returns path-aware errors for missing context', () => {
    const result = validateDescriptor({
      $schema: '../../specs/erc7730-v2.schema.json',
      metadata: { owner: 'Test' },
      display: { formats: {} },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.path.includes('context'))).toBe(true);
    }
  });

  it('returns a $schema path error for an unknown schema URI', () => {
    const result = validateDescriptor({
      $schema: 'https://example.com/not-erc7730.json',
      context: { contract: { deployments: [] } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.path.includes('$schema'))).toBe(true);
    }
  });

  it('returns path-aware errors when context has the wrong type', () => {
    const result = validateDescriptor({
      $schema: '../../specs/erc7730-v2.schema.json',
      context: 'not-an-object',
      metadata: { owner: 'Test' },
      display: { formats: {} },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.path.includes('context'))).toBe(true);
      expect(result.errors.some((error) => error.rule === 'type' || error.rule === 'oneOf')).toBe(
        true
      );
    }
  });

  it('does not throw on invalid input', () => {
    expect(() => validateDescriptor(null)).not.toThrow();
    expect(() => validateDescriptor('descriptor')).not.toThrow();
    expect(() => validateDescriptor([])).not.toThrow();
    expect(validateDescriptor(null).ok).toBe(false);
  });

  it('names an invalid format once', () => {
    const result = validateDescriptor({
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' }],
        },
      },
      display: {
        formats: {
          'transfer(address,uint256)': {
            intent: 'Transfer',
            fields: [{ path: 'to', label: 'To', format: 'bogusFormat' }],
          },
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toContain('/format');
      expect(result.errors[0]?.message).toContain('bogusFormat');
      expect(result.errors[0]?.message).toMatch(/must be one of: .*tokenAmount/);
    }
  });

  it('reports a bad contract deployment instead of the eip712 arm', () => {
    const result = validateDescriptor({
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 'mainnet', address: 1 }],
        },
      },
      metadata: { owner: 'Nope' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.errors.map((error) => `${error.path} ${error.message}`).join('\n');
      expect(text).toMatch(/chainId/);
      expect(text).toMatch(/address/);
      expect(text).not.toMatch(/eip712/);
      expect(result.errors.length).toBeGreaterThan(1);
    }
  });

  it('reports invalid field params instead of the definition reference', () => {
    const base = {
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' }],
        },
      },
    };
    const cases = [
      {
        field: {
          path: 'deadline',
          label: 'Deadline',
          format: 'date',
          params: { encoding: 'nope' },
        },
        path: /params\/encoding/,
        message: /nope/,
      },
      {
        field: { path: 'status', label: 'Status', format: 'enum', params: {} },
        path: /\/params/,
        message: /\$ref/,
      },
      {
        field: {
          path: 'amount',
          label: 'Amount',
          format: 'tokenAmount',
          params: { chainId: '1' },
        },
        path: /params\/chainId/,
        message: /integer|chainId/,
      },
      {
        field: {
          path: 'id',
          label: 'Id',
          format: 'nftName',
          params: { collection: '0xabc', collectionPath: 'token' },
        },
        path: /\/params /,
        message: /collection and collectionPath/,
      },
    ];
    for (const sample of cases) {
      const result = validateDescriptor({
        ...base,
        display: {
          formats: {
            'transfer(address,uint256)': {
              intent: 'Transfer',
              fields: [sample.field],
            },
          },
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const text = result.errors.map((error) => `${error.path} ${error.message}`).join('\n');
        expect(result.errors).toHaveLength(1);
        expect(text).toMatch(sample.path);
        expect(text).toMatch(sample.message);
        expect(text).not.toMatch(/additional property 'format'/);
        expect(text).not.toMatch(/then schema/);
        expect(text).not.toMatch(/unevaluated properties/);
      }
    }
  });

  it('still names an unknown field property', () => {
    const result = validateDescriptor({
      $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' }],
        },
      },
      display: {
        formats: {
          'transfer(address,uint256)': {
            intent: 'Transfer',
            fields: [{ path: 'to', label: 'To', format: 'raw', bonus: true }],
          },
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.errors.map((error) => `${error.path} ${error.message}`).join('\n');
      expect(text).toMatch(/unevaluated properties|additional property 'bonus'/);
      expect(text).not.toMatch(/\$ref/);
    }
  });

  it('rejects additional top-level properties', () => {
    const result = validateDescriptor({
      $schema: '../../specs/erc7730-v2.schema.json',
      context: {
        contract: {
          deployments: [{ chainId: 1, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' }],
        },
      },
      metadata: { owner: 'Test' },
      display: { formats: {} },
      extra: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.path.includes('extra'))).toBe(true);
    }
  });
});
