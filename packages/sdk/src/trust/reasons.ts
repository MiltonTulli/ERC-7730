import type { DecodeSource } from '../decode/types.js';

/**
 * Stable `trust.reasons` codes for telemetry / UI i18n.
 * Prefer these over free-form English sentences.
 */
export const TRUST_REASON_CODES = [
  'source:official-registry:accepted',
  'source:official-registry:rejected',
  'source:attested:accepted',
  'source:attested:rejected',
  'source:local-override:accepted',
  'source:local-override:rejected',
  'source:trusted-token:accepted',
  'source:trusted-token:rejected',
  'source:sourcify:accepted',
  'source:sourcify:rejected',
  'source:generated:accepted',
  'source:generated:rejected',
  'source:inferred:accepted',
  'source:inferred:rejected',
  'source:basic:accepted',
  'source:basic:rejected',
  'untrusted_descriptor',
  'no_policies',
  'ATTESTED',
  'NO_TRUSTED_ATTESTATION',
  'ATTESTATION_OPTIONS_INCOMPLETE',
] as const;

export type TrustReasonCode = (typeof TRUST_REASON_CODES)[number];

export function sourceAcceptedReason(source: DecodeSource): string {
  return `source:${source}:accepted`;
}

export function sourceRejectedReason(source: DecodeSource): string {
  return `source:${source}:rejected`;
}
