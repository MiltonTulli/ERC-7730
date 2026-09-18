import { describe, expect, it } from 'vitest';
import { PathResolveError, resolvePath } from '../decode/path.js';
import type { ResolvedDescriptor } from '../types/descriptor.js';

const descriptor = {
  merged: {
    metadata: {
      enums: {
        interestRateMode: { '0': 'None', '1': 'Stable', '2': 'Variable' },
      },
      constants: {
        max: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      },
    },
  },
} as Pick<ResolvedDescriptor, 'merged'>;

describe('resolvePath', () => {
  it('reads nested tuple fields from #', () => {
    const value = resolvePath('#.tupleField.child', {
      args: { tupleField: { child: 7n } },
      descriptor,
    });
    expect(value).toBe(7n);
  });

  it('treats a bare path as relative to #', () => {
    const value = resolvePath('amount', {
      args: { amount: 100n },
      descriptor,
    });
    expect(value).toBe(100n);
  });

  it('reads $.metadata.enums.* from the merged descriptor', () => {
    const value = resolvePath('$.metadata.enums.interestRateMode', { descriptor });
    expect(value).toEqual({ '0': 'None', '1': 'Stable', '2': 'Variable' });
  });

  it('reads @.to and @.value from the envelope', () => {
    const envelope = {
      to: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
      value: 10n ** 18n,
      chainId: 1,
    };
    expect(resolvePath('@.to', { descriptor, envelope })).toBe(envelope.to);
    expect(resolvePath('@.value', { descriptor, envelope })).toBe(10n ** 18n);
  });

  it('indexes arrays and supports a negative last index', () => {
    const args = { path: [{ to: '0x01' }, { to: '0x02' }, { to: '0x03' }] };
    expect(resolvePath('#.path.[0].to', { args, descriptor })).toBe('0x01');
    expect(resolvePath('#.path.[-1].to', { args, descriptor })).toBe('0x03');
    expect(resolvePath('#.path[]', { args, descriptor })).toEqual(args.path);
  });

  it('returns undefined for a missing path instead of throwing', () => {
    expect(resolvePath('#.missing.child', { args: { other: 1 }, descriptor })).toBeUndefined();
    expect(resolvePath('@.from', { descriptor, envelope: { chainId: 1 } })).toBeUndefined();
  });

  it('throws PathResolveError on malformed syntax', () => {
    expect(() => resolvePath('#.foo[', { args: {}, descriptor })).toThrow(PathResolveError);
    expect(() => resolvePath('', { args: {}, descriptor })).toThrow(PathResolveError);
  });

  it('slices hex bytes', () => {
    const args = { data: '0x001122334455' };
    expect(resolvePath('#.data[1:3]', { args, descriptor })).toBe('0x1122');
    expect(resolvePath('#.data[4:]', { args, descriptor })).toBe('0x4455');
  });
});
