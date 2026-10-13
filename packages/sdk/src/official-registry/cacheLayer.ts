import { cacheKey } from './cache';
import type { OfficialRegistryRuntime } from './runtime';

export async function readCache(
  runtime: OfficialRegistryRuntime,
  key: string
): Promise<unknown | undefined> {
  if (!runtime.cacheable) {
    return undefined;
  }
  const hot = await runtime.memory.get(key);
  if (hot !== undefined) {
    return hot;
  }
  if (!runtime.durable) {
    return undefined;
  }
  const stored = await runtime.durable.get(key);
  if (stored !== undefined) {
    await runtime.memory.set(key, stored);
  }
  return stored;
}

export async function writeCache(
  runtime: OfficialRegistryRuntime,
  key: string,
  value: unknown
): Promise<void> {
  if (!runtime.cacheable) {
    return;
  }
  await runtime.memory.set(key, value);
  if (runtime.durable) {
    await runtime.durable.set(key, value);
  }
}

export function descriptorCacheKey(runtime: OfficialRegistryRuntime, path: string): string {
  return cacheKey(runtime.pin, path);
}
