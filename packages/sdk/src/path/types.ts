import type { ResolvedDescriptor } from '../types/descriptor.js';

/**
 * Transaction / EIP-712 envelope fields addressable with `@.`.
 *
 * EIP-712 has no native value; pass `0n` when the wallet treats it as zero.
 */
export interface PathEnvelope {
  to?: string;
  value?: bigint;
  chainId: number;
  from?: string;
}

export interface PathContext {
  /** Decoded calldata arguments (named object or positional array). */
  args?: unknown;
  /** EIP-712 message (primary-type payload, not the domain). */
  message?: unknown;
  descriptor: ResolvedDescriptor;
  envelope: PathEnvelope;
  /**
   * Parent data path for rootless `tokenPath` / `collectionPath`.
   * Absolute `#.` / `$.` / `@.` children ignore this.
   */
  base?: string;
}

export type PathRoot = 'data' | 'descriptor' | 'container';

export type PathSegment =
  | { type: 'field'; name: string }
  | { type: 'index'; index: number }
  | { type: 'slice'; start?: number; end?: number }
  | { type: 'all' };

export interface ParsedPath {
  root: PathRoot;
  /** False only for rootless data paths (`amount`, `details.token`). */
  absolute: boolean;
  segments: PathSegment[];
  raw: string;
}
