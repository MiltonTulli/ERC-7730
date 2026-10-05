import { OfficialRegistryError } from './error';
import { VENDORED_REGISTRY_COMMIT } from './vendored';

const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;
const FLOATING_REFS = new Set(['master', 'main', 'head', 'origin/master', 'origin/main']);

export function isCommitSha(value: string): boolean {
  return COMMIT_SHA_RE.test(value);
}

/**
 * Production pins must be a full commit SHA so lookups cannot float with `master`.
 */
export function assertRegistryPin(pin: string): string {
  const trimmed = pin.trim();
  if (FLOATING_REFS.has(trimmed.toLowerCase())) {
    throw new OfficialRegistryError(
      `createOfficialRegistry requires a commit SHA pin; refusing floating ref "${trimmed}" (use config.ref for a branch or tag)`
    );
  }
  if (!isCommitSha(trimmed)) {
    throw new OfficialRegistryError(
      'createOfficialRegistry requires config.pin to be a 40-character git commit SHA'
    );
  }
  return trimmed.toLowerCase();
}

/**
 * Resolve the git tree used for official-registry fetches.
 *
 * - omitted `pin` and `ref` → {@link VENDORED_REGISTRY_COMMIT}
 * - `pin` → validated 40-character SHA
 * - `ref` → explicit branch or tag (floating; local-dev escape hatch)
 */
export function resolveRegistryTreeRef(config: {
  pin?: string;
  ref?: string;
}): string {
  const hasPin = typeof config.pin === 'string';
  const hasRef = typeof config.ref === 'string';

  if (hasPin && hasRef) {
    throw new OfficialRegistryError(
      'createOfficialRegistry accepts either config.pin or config.ref, not both'
    );
  }

  if (typeof config.ref === 'string') {
    const trimmed = config.ref.trim();
    if (trimmed.length === 0) {
      throw new OfficialRegistryError(
        'createOfficialRegistry requires config.ref to be a non-empty branch or tag'
      );
    }
    return trimmed;
  }

  if (typeof config.pin === 'string') {
    return assertRegistryPin(config.pin);
  }

  return VENDORED_REGISTRY_COMMIT;
}
