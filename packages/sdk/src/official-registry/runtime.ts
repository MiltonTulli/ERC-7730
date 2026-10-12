import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor';
import type { DescriptorCache, OfficialRegistryConfig } from './types';

export const CALLDATA_INDEX = 'index.calldata.json';
export const EIP712_INDEX = 'index.eip712.json';
export const GITHUB_API = 'https://api.github.com';

/** Mutable state for one `createOfficialRegistry` instance. */
export interface OfficialRegistryRuntime {
  options: OfficialRegistryConfig;
  pin: string;
  cacheable: boolean;
  baseUrl: string;
  memory: DescriptorCache;
  durable: DescriptorCache | undefined;
  fetchImpl: typeof fetch;
  origins: WeakMap<object, string>;
  inflight: Map<string, Promise<unknown>>;
  overrides: InputDescriptor[];
  resolvedOverrides: Map<InputDescriptor, Promise<ResolvedDescriptor>>;
}
