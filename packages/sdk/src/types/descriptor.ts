/**
 * Public descriptor types for validateDescriptor() and resolveDescriptor().
 *
 * `InputDescriptor` is the loaded JSON document (includes unresolved).
 * Detailed v2 shapes live in `./v2.js` and follow erc7730-v2.schema.json.
 */

export type DescriptorVersion = '1' | '2';

export type Hex = `0x${string}`;

/**
 * Unresolved ERC-7730 document.
 *
 * Official files may omit `context`, `metadata`, or `display` when those
 * sections come from `includes`.
 */
export interface InputDescriptor {
  $schema?: string;
  $comment?: string;
  includes?: string;
  context?: unknown;
  metadata?: unknown;
  display?: unknown;
}

export interface IncludeLoader {
  /**
   * Load the document referenced by `includes`.
   *
   * `ref` is the raw URI from the including file (relative path or URL).
   * `from` is the including descriptor.
   */
  load(ref: string, from: InputDescriptor): Promise<unknown>;
}

export interface ResolvedDeployment {
  chainId: number;
  address: `0x${string}`;
}

/**
 * Descriptor after includes are merged and field `$ref`s are inlined.
 *
 * `merged` stays an InputDescriptor-shaped JSON document (format keys are
 * not converted to 4-byte selectors).
 */
export interface ResolvedDescriptor {
  version: DescriptorVersion;
  hash: Hex;
  input: InputDescriptor;
  merged: InputDescriptor;
  deployments: ResolvedDeployment[];
  /**
   * Set by registry clients so TrustPolicy can tell a pinned official file
   * from an `extend()` override. `resolveDescriptor` does not set this.
   */
  source?: 'official-registry' | 'local-override';
  /** Registry path of the official file, when known. */
  registryPath?: string;
  /**
   * ERC-8176 offchain attestation JSON blobs (e.g. `registry/<project>/sigs/`).
   * Consumed by `attestedPolicy`.
   */
  attestations?: readonly unknown[];
}

export interface ValidationIssue {
  path: string;
  message: string;
  rule?: string;
}

export type ValidationResult =
  | { ok: true; descriptor: InputDescriptor; version: DescriptorVersion }
  | { ok: false; errors: ValidationIssue[] };
