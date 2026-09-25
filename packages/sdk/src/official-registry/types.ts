import type { Hex, InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';
import type { LogBlockTag, Provider } from '../types/index.js';

export type Address = `0x${string}`;

export type Caip10 = `eip155:${number}:${string}`;

/**
 * Lookup key for official `index.calldata.json` / `index.eip712.json`.
 *
 * Calldata is keyed by CAIP-10 only. `selector` / `signature` are reserved for
 * decode-time format matching and are not used to pick the file.
 *
 * EIP-712 may have several files per contract. Pass `signature` (primaryType)
 * and/or `encodeTypeHash` when more than one descriptor applies.
 */
export interface RegistryLookupKey {
  chainId: number;
  address: Address;
  selector?: Hex;
  signature?: string;
  encodeTypeHash?: Hex;
  /** Used to verify factory / proxy context when the CAIP-10 key is a clone. */
  provider?: Provider | null;
  fromBlock?: bigint | LogBlockTag;
  toBlock?: bigint | LogBlockTag;
}

export interface DescriptorCache {
  get(key: string): Promise<unknown | undefined> | unknown | undefined;
  set(key: string, value: unknown): Promise<void> | void;
}

export interface OfficialRegistry {
  findCalldata(key: RegistryLookupKey): Promise<ResolvedDescriptor | null>;
  findEip712(key: RegistryLookupKey): Promise<ResolvedDescriptor | null>;
  extend(descriptors: InputDescriptor[]): void;
}

export interface OfficialRegistryIndexes {
  calldata?: CalldataIndex;
  eip712?: Eip712Index;
}

export interface OfficialRegistryConfig {
  /** Full 40-character git commit SHA. Required. Never `master` / `main`. */
  pin: string;
  /** Prefix before `/{pin}/{path}`. Defaults to GitHub raw for the official repo. */
  baseUrl?: string;
  /** Optional durable cache (fs / IndexedDB). Memory cache is always on. */
  cache?: DescriptorCache;
  /** Injected `fetch` (tests, custom gateways). Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /**
   * Caller-owned index objects (from {@link fetchPrebuiltRegistryIndex}).
   * When set, those files are not fetched again.
   */
  indexes?: OfficialRegistryIndexes;
  /**
   * Load ERC-8176 attestation JSON from `registry/<project>/sigs/` next to
   * each official descriptor. Default false (keeps unit-test mocks simple).
   */
  attachAttestations?: boolean;
}

export type CalldataIndex = Record<string, string>;

export interface Eip712IndexEntry {
  path: string;
  encodeTypeHashes: string[];
}

export type Eip712Index = Record<string, Record<string, Eip712IndexEntry[]>>;
