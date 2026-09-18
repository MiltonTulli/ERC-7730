/**
 * Public descriptor types for validateDescriptor().
 *
 * `InputDescriptor` is the loaded JSON document (includes unresolved).
 * Detailed v2 shapes live in `./v2.js` and follow erc7730-v2.schema.json.
 */

export type DescriptorVersion = '1' | '2';

/**
 * Unresolved ERC-7730 document.
 *
 * Official files may omit `context`, `metadata`, or `display` when those
 * sections come from `includes`. Include/`$ref` merge is out of scope here.
 */
export interface InputDescriptor {
  $schema?: string;
  $comment?: string;
  includes?: string;
  context?: unknown;
  metadata?: unknown;
  display?: unknown;
}

export interface ValidationIssue {
  path: string;
  message: string;
  rule?: string;
}

export type ValidationResult =
  | { ok: true; descriptor: InputDescriptor; version: DescriptorVersion }
  | { ok: false; errors: ValidationIssue[] };
