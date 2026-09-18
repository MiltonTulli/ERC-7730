import { OfficialRegistryError } from './error.js';

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
      `createOfficialRegistry requires a commit SHA pin; refusing floating ref "${trimmed}"`
    );
  }
  if (!isCommitSha(trimmed)) {
    throw new OfficialRegistryError(
      'createOfficialRegistry requires config.pin to be a 40-character git commit SHA'
    );
  }
  return trimmed.toLowerCase();
}
