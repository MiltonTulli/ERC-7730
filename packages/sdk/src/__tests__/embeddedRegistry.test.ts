import { describe, expect, it } from 'vitest';
import { findByAddress, getExternalDescriptors, getStats } from '../registry/external';

describe('embedded registry', () => {
  it('exposes numeric stats from the generated catalog', () => {
    const stats = getStats();
    expect(stats.descriptors).toBeGreaterThan(0);
    expect(stats.protocols).toBeGreaterThan(0);
    expect(stats.selectors).toBeGreaterThan(0);
    expect(stats.addresses).toBeGreaterThan(0);
  });

  it('adapts every embedded descriptor to the SDK descriptor shape', () => {
    const descriptors = getExternalDescriptors();
    expect(descriptors.length).toBe(getStats().descriptors);
    for (const descriptor of descriptors) {
      expect(descriptor.display.formats).toBeTypeOf('object');
      for (const deployment of descriptor.context.contract?.deployments ?? []) {
        expect(typeof deployment.chainId).toBe('number');
        expect(deployment.address.startsWith('0x')).toBe(true);
      }
    }
  });

  it('coerces decimal-string chain ids from vendored deployments', () => {
    const matches = findByAddress('0x8236a87084f8b84306f72007f36f2618a5634494', 1);
    expect(matches.length).toBeGreaterThan(0);
    expect(
      matches.some((descriptor) =>
        descriptor.context.contract?.deployments.some(
          (deployment) =>
            deployment.chainId === 1 &&
            deployment.address.toLowerCase() === '0x8236a87084f8b84306f72007f36f2618a5634494'
        )
      )
    ).toBe(true);
  });
});
