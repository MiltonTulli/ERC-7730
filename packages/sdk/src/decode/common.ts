import { InvalidInputError } from '../errors';
import { isPlainObject } from '../resolve/util';
import { officialOnlyPolicy } from '../trust/policy';
import { sourceAcceptedReason, sourceRejectedReason } from '../trust/reasons';
import type { ResolvedDescriptor } from '../types/descriptor';
import type {
  Address,
  Confidence,
  DecodeOptions,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
  TrustReport,
} from './types';

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export function asAddress(value: string): Address {
  if (!ADDRESS_RE.test(value)) {
    throw new InvalidInputError('INVALID_ADDRESS', `Invalid address: ${value}`);
  }
  return value as Address;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

/**
 * Intent strings are never locale-translated. `locale` only formats amounts/dates.
 * Prefer a plain string, else `en`, else the first string value on the map.
 */
function staticIntent(intent: unknown, _locale: string): string {
  if (typeof intent === 'string' && intent.length > 0) {
    return intent;
  }
  if (isPlainObject(intent)) {
    return (
      (typeof intent.en === 'string' && intent.en) ||
      (Object.values(intent).find((value) => typeof value === 'string') as string | undefined) ||
      'Contract interaction'
    );
  }
  return 'Contract interaction';
}

export interface RenderedIntent {
  intent: string;
  interpolatedIntent?: string;
  interpolationFailed: boolean;
}

/**
 * Prefer the filled sentence when every `{path}` resolves. Keep the short
 * intent when the template is missing or incomplete.
 */
export function renderIntent(
  intent: unknown,
  interpolated: unknown,
  fields: DecodedField[],
  locale: string
): RenderedIntent {
  const short = staticIntent(intent, locale);
  if (typeof interpolated !== 'string' || interpolated.length === 0) {
    return { intent: short, interpolationFailed: false };
  }
  const replaced = interpolated.replace(/\{([^{}]+)\}/g, (full, path: string) => {
    const exact = fields.find((field) => field.path === path || field.path === `#.${path}`);
    const suffix = fields.find(
      (field) => field.path.endsWith(`.${path}`) || field.path.endsWith(`].${path}`)
    );
    const match = exact ?? suffix;
    return match ? match.value : full;
  });
  if (/\{[^{}]+\}/.test(replaced)) {
    return { intent: short, interpolationFailed: true };
  }
  // Keep `intent` as the filled sentence for wallets that only read that field.
  return { intent: replaced, interpolatedIntent: replaced, interpolationFailed: false };
}

export function confidenceFor(source: DecodeSource, accepted: boolean): Confidence {
  if (source === 'trusted-token') {
    return 'low';
  }
  if (source === 'builtin') {
    return accepted ? 'medium' : 'low';
  }
  if (source === 'official-registry' || source === 'attested') {
    return accepted ? 'high' : 'low';
  }
  if (source === 'local-override') {
    return accepted ? 'medium' : 'low';
  }
  return 'low';
}

export function attestationFailed(trust: TrustReport): boolean {
  return trust.reasons.some(
    (reason) => reason === 'no_trusted_attestation' || reason === 'attestation_options_incomplete'
  );
}

export function withAttestedSource(operation: DecodedOperation): DecodedOperation {
  if (
    operation.trust.accepted &&
    operation.trust.attesters &&
    operation.trust.attesters.length > 0 &&
    (operation.source === 'official-registry' || operation.source === 'attested')
  ) {
    return {
      ...operation,
      source: 'attested',
      confidence: confidenceFor('attested', true),
    };
  }
  return operation;
}

export function noTrustedAttestationWarning(): SecurityWarning {
  return {
    type: 'no_trusted_attestation',
    severity: 'high',
    message: 'No trusted ERC-8176 attestation for this descriptor',
  };
}

function lowerConfidence(current: Confidence, next: Confidence): Confidence {
  return CONFIDENCE_RANK[next] < CONFIDENCE_RANK[current] ? next : current;
}

/**
 * Nested `calldata` lives on `details.embedded` when `format` is `calldata`.
 * Copy its warnings onto the outer operation (path-prefixed) and never report
 * a higher confidence than the inner display.
 */
export function absorbEmbedded(
  fields: DecodedField[],
  warnings: SecurityWarning[],
  confidence: Confidence
): { warnings: SecurityWarning[]; confidence: Confidence } {
  let next = confidence;
  const extra: SecurityWarning[] = [];
  for (const field of fields) {
    if (field.format !== 'calldata') {
      continue;
    }
    const embedded = field.details.embedded;
    for (const warning of embedded.warnings) {
      const path = warning.path ? `${field.path}.${warning.path}` : field.path;
      extra.push({ ...warning, path });
    }
    next = lowerConfidence(next, embedded.confidence);
    if (!embedded.trust.accepted) {
      next = 'low';
    }
  }
  return { warnings: extra.length > 0 ? [...warnings, ...extra] : warnings, confidence: next };
}

export function interpolationFailedWarning(): SecurityWarning {
  return {
    type: 'interpolation_failed',
    severity: 'low',
    message: 'Intent template could not be filled; showing the short intent and fields',
  };
}

export function sourceFromResolved(
  resolved: ResolvedDescriptor,
  fallback: DecodeSource = 'local-override'
): DecodeSource {
  return resolved.source ?? fallback;
}

export function finalizeTrust(
  report: TrustReport,
  source: DecodeSource,
  descriptor: ResolvedDescriptor | undefined,
  policyId: string
): TrustReport {
  const accepted = Boolean(report.accepted);
  const reasons =
    Array.isArray(report.reasons) && report.reasons.length > 0
      ? report.reasons
      : accepted
        ? [sourceAcceptedReason(source)]
        : [sourceRejectedReason(source)];
  return {
    accepted,
    policy: report.policy || policyId,
    descriptorHash: report.descriptorHash ?? descriptor?.hash,
    attesters: report.attesters,
    reasons,
  };
}

export function appendUntrustedWarning(
  warnings: SecurityWarning[],
  trust: TrustReport,
  source: DecodeSource
): void {
  if (trust.accepted) {
    return;
  }
  if (warnings.some((warning) => warning.type === 'untrusted_descriptor')) {
    return;
  }
  const usedDescriptor = Boolean(trust.descriptorHash);
  const looksCurated = usedDescriptor || source === 'sourcify' || source === 'generated';
  warnings.push({
    type: 'untrusted_descriptor',
    severity: looksCurated ? 'high' : 'medium',
    message: usedDescriptor
      ? 'Display metadata was not accepted by the trust policy'
      : `Source "${source}" is not accepted by the trust policy`,
  });
}

export async function resolveTrust(
  options: DecodeOptions | undefined,
  source: DecodeSource,
  descriptor: ResolvedDescriptor | undefined,
  chainId: number | undefined,
  address?: Address
): Promise<TrustReport> {
  const policy = options?.trust ?? officialOnlyPolicy();
  const report = await policy.evaluate({
    descriptor,
    chainId,
    address,
    source,
    now: nowSeconds(options),
  });
  const finalized = finalizeTrust(report, source, descriptor, policy.id);
  options?.diagnosticLog?.push(
    finalized.accepted
      ? {
          stage: 'trust',
          outcome: 'hit',
          code: 'TRUST_ACCEPTED',
          message: `Trust policy ${finalized.policy} accepted source ${source}`,
          details: { reasons: finalized.reasons, source },
        }
      : {
          stage: 'trust',
          outcome: 'miss',
          code: 'POLICY_REJECTED',
          message: `Trust policy ${finalized.policy} rejected source ${source}`,
          details: { reasons: finalized.reasons, source },
        }
  );
  options?.onEvent?.(
    finalized.accepted
      ? { type: 'trust:accepted', reasons: [...finalized.reasons] }
      : { type: 'trust:rejected', reasons: [...finalized.reasons] }
  );
  return finalized;
}

export function readMetadata(merged: unknown): {
  owner?: string;
  contractName?: string;
  protocolUrl?: string;
  descriptorId?: string;
} {
  if (!isPlainObject(merged)) {
    return {};
  }
  const metadata = asRecord(merged.metadata);
  const context = asRecord(merged.context);
  const info = asRecord(metadata?.info);
  return {
    owner: typeof metadata?.owner === 'string' ? metadata.owner : undefined,
    contractName: typeof metadata?.contractName === 'string' ? metadata.contractName : undefined,
    protocolUrl: typeof info?.url === 'string' ? info.url : undefined,
    descriptorId: typeof context?.$id === 'string' ? context.$id : undefined,
  };
}

/** Unix time in seconds. */
export function nowSeconds(options?: DecodeOptions): number {
  const now = options?.now;
  if (typeof now === 'function') {
    return now();
  }
  if (typeof now === 'number' && Number.isFinite(now)) {
    return Math.trunc(now);
  }
  return Math.floor(Date.now() / 1000);
}
