/**
 * Types for the private `@erc7730/registry` JSON index.
 *
 * This package is fixture/catalog data for the SDK embed build. It is not a
 * third ERC-7730 descriptor dialect: descriptor document shapes live in
 * `@erc7730/sdk` (`InputDescriptor`, generated from the official v2 schema).
 * Entries here only store enough structure for the minified embed index.
 */

/** Narrow deployment row kept in catalog entries. */
export interface RegistryDeployment {
  chainId: number | string;
  address: string;
}

/**
 * One catalog entry under `descriptors`.
 * `context` / `metadata` / `display` are opaque JSON bags from source files.
 */
export interface RegistryDescriptorEntry {
  protocol: string;
  file: string;
  context?: unknown;
  metadata?: unknown;
  display?: unknown;
}

export interface ERC7730Registry {
  $schema: string;
  version: string;
  generated: string;
  stats: {
    protocols: number;
    descriptors: number;
    selectors: number;
    addresses: number;
  };
  bySelector: Record<string, string[]>;
  byAddress: Record<string, string[]>;
  descriptors: Record<string, RegistryDescriptorEntry>;
}
