import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeNamedArgs, parseDeclaration } from '../decode/abi';
import { registryFileUrl } from '../official-registry/paths';
import { fetchFromSourcify } from '../providers/sourcify';
import { mergeDescriptorDocs } from '../resolve/merge';

const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('prototype keys', () => {
  it('drops __proto__, constructor, and prototype when merging formats', () => {
    const overlay = JSON.parse(
      '{"display":{"formats":{"__proto__":{"intent":"Injected"},"constructor":{"intent":"No"},"prototype":{"intent":"No"},"transfer(address,uint256)":{"intent":"Send"}}}}'
    ) as Record<string, unknown>;
    const merged = mergeDescriptorDocs({}, overlay) as {
      display: { formats: Record<string, { intent?: string }> };
    };
    const formats = merged.display.formats;

    expect(formats['transfer(address,uint256)']?.intent).toBe('Send');
    expect(Object.hasOwn(formats, '__proto__')).toBe(false);
    expect(Object.hasOwn(formats, 'constructor')).toBe(false);
    expect(Object.hasOwn(formats, 'prototype')).toBe(false);
    expect(Object.getPrototypeOf(formats)).toBe(Object.prototype);
    expect(({} as { intent?: string }).intent).toBeUndefined();
  });

  it('does not install a param named __proto__ on the argument map', () => {
    const declaration = parseDeclaration('transfer(address __proto__, uint256 value)');
    expect(declaration).not.toBeNull();
    const encoded = encodeAbiParameters(parseAbiParameters('address,uint256'), [VITALIK, 1n]);
    const data = `${declaration?.selector}${encoded.slice(2)}`;
    const result = decodeNamedArgs(data, declaration);

    expect(Object.getPrototypeOf(result.named)).toBe(null);
    expect(result.named.__proto__).toBeUndefined();
    expect(result.named['0']).toBe(VITALIK);
    expect(result.named.value).toBe(1n);
  });
});

describe('registry refs', () => {
  it('encodes each path segment', () => {
    const url = registryFileUrl(
      'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry',
      '9f37816afde954ff6617fb5baa346133e5af26c5',
      'registry/foo bar.json'
    );
    expect(url).toContain('/registry/foo%20bar.json');
    expect(url).not.toContain('foo bar');
  });
});

describe('Sourcify URLs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch when the address contains a slash', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchFromSourcify(1, '0x1234/../../../evil');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.verified).toBe(false);
    expect(await fetchFromSourcify(1.5, `0x${'ab'.repeat(20)}`)).toMatchObject({
      verified: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('declaration scanner', () => {
  it('finishes a 10k-space declaration in under 10ms', () => {
    const declaration = `transfer(${' '.repeat(10_000)}`;
    const start = performance.now();
    expect(parseDeclaration(declaration)).toBeNull();
    expect(performance.now() - start).toBeLessThan(10);
  });
});
