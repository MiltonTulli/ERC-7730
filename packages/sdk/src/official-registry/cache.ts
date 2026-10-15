import type { DescriptorCache } from './types';

/** Process-local {@link DescriptorCache}. Not shared across registry instances. */
export function createMemoryDescriptorCache(): DescriptorCache {
  const store = new Map<string, unknown>();
  return {
    get(key) {
      return store.get(key);
    },
    set(key, value) {
      store.set(key, value);
    },
  };
}

export function cacheKey(pin: string, path: string): string {
  return `${pin}:${path}`;
}
