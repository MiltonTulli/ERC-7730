/**
 * Shape of the minified catalog written by `packages/sdk/scripts/build.js`.
 *
 * This is not `@erc7730/registry`'s `ERC7730Registry`. The embed drops
 * `$schema`, `version`, `generated`, ABIs, and protocol/file ids, and keeps
 * only the display tree plus deployments and a short metadata slice.
 * `embedded.ts` annotates the generated object with this type so `tsc`
 * rejects a catalog that no longer matches.
 */

export interface EmbeddedRegistryStats {
  protocols: number;
  descriptors: number;
  selectors: number;
  addresses: number;
}

export interface EmbeddedDeployment {
  /** Some vendored files store the chain id as a decimal string. */
  chainId: number | string;
  address: string;
}

export interface EmbeddedField {
  path?: string;
  label?: string;
  format?: string;
  params?: Record<string, unknown> | null;
  $ref?: string;
  value?: string | null;
  $id?: string | null;
  fields?: EmbeddedField[];
}

export interface EmbeddedFunctionFormat {
  $id?: string | null;
  intent?: string;
  fields?: EmbeddedField[];
  required?: string[];
  excluded?: string[] | null;
  screens?: Record<string, unknown> | null;
}

export interface EmbeddedDisplay {
  formats?: Record<string, EmbeddedFunctionFormat>;
  definitions?: Record<string, unknown>;
}

export interface EmbeddedDescriptor {
  display?: EmbeddedDisplay;
  context?: {
    contract?: {
      deployments?: EmbeddedDeployment[];
    };
  };
  metadata?: {
    owner?: string;
    info?: {
      url?: string;
    };
  };
}

export interface EmbeddedRegistry {
  stats: EmbeddedRegistryStats;
  bySelector: Record<string, string[]>;
  byAddress: Record<string, string[]>;
  descriptors: Record<string, EmbeddedDescriptor>;
}
