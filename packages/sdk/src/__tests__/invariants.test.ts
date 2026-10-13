import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalizeDeclaration, canonicalizeType } from '../decode/abi';
import { parsePath, printPath } from '../path/parse';
import type { ParsedPath, PathSegment } from '../path/types';
import { descriptorHash } from '../resolve';
import { mergeDescriptorDocs, mergeIncludes } from '../resolve/merge';
import type { InputDescriptor } from '../types/descriptor';
import { ADDRESS_RE } from '../util';

const CONTAINER_FIELDS = ['from', 'to', 'value', 'chainId'] as const;

const SPEC_TYPE: Record<string, string> = {
  uint: 'uint256',
  int: 'int256',
  ufixed: 'ufixed128x18',
  fixed: 'fixed128x18',
  address: 'address',
  bool: 'bool',
  bytes: 'bytes',
  string: 'string',
  uint8: 'uint8',
  bytes32: 'bytes32',
};

function parsed(root: ParsedPath['root'], absolute: boolean, segments: PathSegment[]): ParsedPath {
  return { root, absolute, segments, raw: '' };
}

function sameStructure(actual: ParsedPath, expected: ParsedPath): void {
  expect(actual.root).toBe(expected.root);
  expect(actual.absolute).toBe(expected.absolute);
  expect(actual.segments).toEqual(expected.segments);
}

const fieldName = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,11}$/);
const indexArb = fc.integer({ min: -30, max: 30 });
const fieldSeg: fc.Arbitrary<PathSegment> = fieldName.map((name) => ({ type: 'field', name }));
const indexSeg: fc.Arbitrary<PathSegment> = indexArb.map((index) => ({ type: 'index', index }));
const sliceSeg: fc.Arbitrary<PathSegment> = fc
  .record({
    start: fc.option(indexArb, { nil: undefined }),
    end: fc.option(indexArb, { nil: undefined }),
  })
  .map(({ start, end }) => ({ type: 'slice', start, end }));
const allSeg: fc.Arbitrary<PathSegment> = fc.constant({ type: 'all' });
const dataSeg = fc.oneof(fieldSeg, indexSeg, sliceSeg, allSeg);
const descriptorSeg = fc.oneof(fieldSeg, indexSeg);

const dataPath: fc.Arbitrary<ParsedPath> = fc
  .record({
    absolute: fc.boolean(),
    segments: fc.array(dataSeg, { minLength: 1, maxLength: 5 }),
  })
  .map(({ absolute, segments }) => parsed('data', absolute, segments));

const descriptorPath: fc.Arbitrary<ParsedPath> = fc
  .array(descriptorSeg, { minLength: 1, maxLength: 4 })
  .map((segments) => parsed('descriptor', true, segments));

const containerPath: fc.Arbitrary<ParsedPath> = fc
  .constantFrom(...CONTAINER_FIELDS)
  .map((name) => parsed('container', true, [{ type: 'field', name }]));

const anyPath = fc.oneof(dataPath, descriptorPath, containerPath);

const PRINTED: Array<[ParsedPath, string]> = [
  [parsed('data', true, [{ type: 'field', name: 'amount' }]), '#.amount'],
  [parsed('data', false, [{ type: 'field', name: 'amount' }]), 'amount'],
  [
    parsed('data', false, [
      { type: 'field', name: 'pools' },
      { type: 'index', index: -1 },
    ]),
    'pools.[-1]',
  ],
  [
    parsed('data', false, [
      { type: 'field', name: 'tokens' },
      { type: 'index', index: 0 },
    ]),
    'tokens.[0]',
  ],
  [parsed('data', false, [{ type: 'field', name: 'details' }, { type: 'all' }]), 'details.[]'],
  [
    parsed('data', false, [
      { type: 'field', name: 'path' },
      { type: 'slice', start: -20, end: undefined },
    ]),
    'path.[-20:]',
  ],
  [
    parsed('data', false, [
      { type: 'field', name: 'data' },
      { type: 'slice', start: undefined, end: 32 },
    ]),
    'data.[:32]',
  ],
  [parsed('data', false, [{ type: 'slice', start: undefined, end: 32 }]), '[:32]'],
  [
    parsed('data', true, [
      { type: 'index', index: 0 },
      { type: 'field', name: 'name' },
    ]),
    '#.[0].name',
  ],
  [parsed('container', true, [{ type: 'field', name: 'value' }]), '@.value'],
  [
    parsed('descriptor', true, [
      { type: 'field', name: 'metadata' },
      { type: 'field', name: 'owner' },
    ]),
    '$.metadata.owner',
  ],
  [
    parsed('descriptor', true, [
      { type: 'field', name: 'items' },
      { type: 'index', index: 1 },
    ]),
    '$.items.[1]',
  ],
  [
    parsed('data', false, [
      { type: 'field', name: 'a' },
      { type: 'field', name: 'b' },
      { type: 'index', index: 2 },
      { type: 'all' },
    ]),
    'a.b.[2].[]',
  ],
];

describe('path grammar', () => {
  it.each(PRINTED)('prints the canonical form %s', (path, printed) => {
    expect(printPath(path)).toBe(printed);
    sameStructure(parsePath(printed), path);
  });

  it('parse(print(path)) is the identity', () => {
    fc.assert(
      fc.property(anyPath, (path) => {
        sameStructure(parsePath(printPath(path)), path);
      })
    );
  });
});

const abiBase = fc.constantFrom(...Object.keys(SPEC_TYPE));
const abiSuffix = fc
  .array(fc.constantFrom('[]', '[0]', '[2]'), { maxLength: 3 })
  .map((parts) => parts.join(''));

describe('ABI canonicalization', () => {
  it('maps aliases to the canonical type and keeps array suffixes', () => {
    fc.assert(
      fc.property(abiBase, abiSuffix, (base, suffix) => {
        const canonical = `${SPEC_TYPE[base]}${suffix}`;
        expect(canonicalizeType(`${base}${suffix}`)).toBe(canonical);
        expect(canonicalizeType(canonical)).toBe(canonical);
      })
    );
  });

  it('drops names and data locations from a declaration', () => {
    const location = fc.constantFrom('', ' calldata', ' memory');
    const paramName = fc.constantFrom('', ' amount', ' to');
    fc.assert(
      fc.property(abiBase, abiSuffix, location, paramName, (base, suffix, loc, name) => {
        const source = `transfer(address to, ${base}${suffix}${loc}${name})`;
        const expected = `transfer(address,${SPEC_TYPE[base]}${suffix})`;
        expect(canonicalizeDeclaration(source)).toBe(expected);
        expect(canonicalizeDeclaration(expected)).toBe(expected);
      })
    );
  });
});

function isPlain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseKeys);
  }
  if (!isPlain(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  const entries = Object.entries(value);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (!entry) {
      continue;
    }
    out[entry[0]] = reverseKeys(entry[1]);
  }
  return out;
}

function flipAddressCase(value: unknown): unknown {
  if (typeof value === 'string' && ADDRESS_RE.test(value)) {
    const hex = value
      .slice(2)
      .split('')
      .map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()))
      .join('');
    return `0x${hex}`;
  }
  if (Array.isArray(value)) {
    return value.map(flipAddressCase);
  }
  if (!isPlain(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = flipAddressCase(child);
  }
  return out;
}

const jsonKey = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
const addressArb = fc.stringMatching(/^[0-9a-f]{40}$/).map((hex) => `0x${hex}`);
const jsonArb: fc.Arbitrary<unknown> = fc.letrec<{ value: unknown }>((tie) => ({
  value: fc.oneof(
    fc.string({ maxLength: 16 }),
    fc.integer({ min: -50, max: 50 }),
    fc.boolean(),
    fc.constant(null),
    addressArb,
    fc.array(tie('value'), { maxLength: 3 }),
    fc.dictionary(jsonKey, tie('value'), { maxKeys: 4 })
  ),
})).value;

describe('descriptorHash', () => {
  it('ignores key order and address case', () => {
    fc.assert(
      fc.property(jsonArb, (value) => {
        const original = descriptorHash(value as InputDescriptor);
        const reordered = descriptorHash(reverseKeys(value) as InputDescriptor);
        const recased = descriptorHash(flipAddressCase(value) as InputDescriptor);
        expect(reordered).toBe(original);
        expect(recased).toBe(original);
      })
    );
  });

  it('changes when a non-address field changes', () => {
    const tether = descriptorHash({ metadata: { owner: 'Tether' } });
    const maker = descriptorHash({ metadata: { owner: 'Maker' } });
    expect(tether).not.toBe(maker);
  });
});

const fieldLabel = fc.constantFrom('To', 'Amount', 'Spender', 'Tokens');
const fieldPath = fc.integer({ min: 0, max: 12 }).map((index) => `#.field${index}`);
const fieldArb = fc.record({ path: fieldPath, label: fieldLabel });
const fieldsArb = fc.uniqueArray(fieldArb, {
  selector: (field) => field.path,
  minLength: 0,
  maxLength: 4,
});

describe('merge', () => {
  it('keeps one field per path when the same overlay is merged twice', () => {
    const base = {
      fields: [
        { path: '#.to', label: 'To' },
        { path: '#.amount', label: 'Amount' },
      ],
    };
    const overlay = {
      fields: [{ path: '#.amount', label: 'Tokens', params: { decimals: 6 } }],
    };
    const once = mergeDescriptorDocs(base, overlay);
    expect(once).toEqual({
      fields: [
        { path: '#.to', label: 'To' },
        { path: '#.amount', label: 'Tokens', params: { decimals: 6 } },
      ],
    });
    expect(mergeDescriptorDocs(once, overlay)).toEqual(once);
  });

  it('is idempotent for field overlays', () => {
    fc.assert(
      fc.property(fieldsArb, fieldsArb, (baseFields, overlayFields) => {
        const base = { display: { formats: { transfer: { fields: baseFields } } } };
        const overlay = { display: { formats: { transfer: { fields: overlayFields } } } };
        const once = mergeDescriptorDocs(base, overlay);
        expect(mergeDescriptorDocs(once, overlay)).toEqual(once);
      })
    );
  });

  it('is idempotent after includes are merged', async () => {
    const ownerArb = fc.string({ minLength: 1, maxLength: 12 });
    await fc.assert(
      fc.asyncProperty(ownerArb, fieldLabel, async (owner, label) => {
        const parent = {
          metadata: { owner: 'Parent' },
          display: {
            formats: {
              transfer: { fields: [{ path: '#.to', label: 'To' }] },
            },
          },
        };
        const child = {
          includes: 'parent.json',
          metadata: { owner },
          display: {
            formats: {
              transfer: {
                fields: [
                  { path: '#.to', label },
                  { path: '#.amount', label: 'Amount' },
                ],
              },
            },
          },
        };
        const loader = {
          async load(ref: string) {
            if (ref !== 'parent.json') {
              throw new Error(`unexpected include ${ref}`);
            }
            return parent;
          },
        };
        const once = await mergeIncludes(child, loader);
        const twice = await mergeIncludes(once as InputDescriptor, loader);
        expect(twice).toEqual(once);
        expect(once).not.toHaveProperty('includes');
        const formats = (
          once.display as {
            formats: { transfer: { fields: Array<{ path: string; label: string }> } };
          }
        ).formats;
        expect(formats.transfer.fields).toEqual([
          { path: '#.to', label },
          { path: '#.amount', label: 'Amount' },
        ]);
      })
    );
  });
});
