import type { DecodeSource } from '../decode/types';

/**
 * Stable `trust.reasons` codes for telemetry and UI.
 * Snake case only. The array and the union must list the same members.
 */
export type TrustReasonCode =
  | 'source_official_registry_accepted'
  | 'source_official_registry_rejected'
  | 'source_attested_accepted'
  | 'source_attested_rejected'
  | 'source_local_override_accepted'
  | 'source_local_override_rejected'
  | 'source_trusted_token_accepted'
  | 'source_trusted_token_rejected'
  | 'source_builtin_accepted'
  | 'source_builtin_rejected'
  | 'source_sourcify_accepted'
  | 'source_sourcify_rejected'
  | 'source_generated_accepted'
  | 'source_generated_rejected'
  | 'source_inferred_accepted'
  | 'source_inferred_rejected'
  | 'source_basic_accepted'
  | 'source_basic_rejected'
  | 'untrusted_descriptor'
  | 'no_policies'
  | 'attested'
  | 'no_trusted_attestation'
  | 'attestation_options_incomplete';

export const TRUST_REASON_CODES = [
  'source_official_registry_accepted',
  'source_official_registry_rejected',
  'source_attested_accepted',
  'source_attested_rejected',
  'source_local_override_accepted',
  'source_local_override_rejected',
  'source_trusted_token_accepted',
  'source_trusted_token_rejected',
  'source_builtin_accepted',
  'source_builtin_rejected',
  'source_sourcify_accepted',
  'source_sourcify_rejected',
  'source_generated_accepted',
  'source_generated_rejected',
  'source_inferred_accepted',
  'source_inferred_rejected',
  'source_basic_accepted',
  'source_basic_rejected',
  'untrusted_descriptor',
  'no_policies',
  'attested',
  'no_trusted_attestation',
  'attestation_options_incomplete',
] as const satisfies readonly TrustReasonCode[];

type ListedCode = (typeof TRUST_REASON_CODES)[number];
type MissingReasonCode = Exclude<TrustReasonCode, ListedCode>;
type _TrustReasonCodesAreExhaustive = MissingReasonCode extends never ? true : never;
const _trustReasonCodesAreExhaustive: _TrustReasonCodesAreExhaustive = true;
void _trustReasonCodesAreExhaustive;

const SOURCE_REASONS: Record<
  DecodeSource,
  { accepted: TrustReasonCode; rejected: TrustReasonCode }
> = {
  'official-registry': {
    accepted: 'source_official_registry_accepted',
    rejected: 'source_official_registry_rejected',
  },
  attested: {
    accepted: 'source_attested_accepted',
    rejected: 'source_attested_rejected',
  },
  'local-override': {
    accepted: 'source_local_override_accepted',
    rejected: 'source_local_override_rejected',
  },
  'trusted-token': {
    accepted: 'source_trusted_token_accepted',
    rejected: 'source_trusted_token_rejected',
  },
  builtin: {
    accepted: 'source_builtin_accepted',
    rejected: 'source_builtin_rejected',
  },
  sourcify: {
    accepted: 'source_sourcify_accepted',
    rejected: 'source_sourcify_rejected',
  },
  generated: {
    accepted: 'source_generated_accepted',
    rejected: 'source_generated_rejected',
  },
  inferred: {
    accepted: 'source_inferred_accepted',
    rejected: 'source_inferred_rejected',
  },
  basic: {
    accepted: 'source_basic_accepted',
    rejected: 'source_basic_rejected',
  },
};

export function sourceAcceptedReason(source: DecodeSource): TrustReasonCode {
  return SOURCE_REASONS[source].accepted;
}

export function sourceRejectedReason(source: DecodeSource): TrustReasonCode {
  return SOURCE_REASONS[source].rejected;
}
