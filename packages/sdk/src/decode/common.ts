import { isPlainObject } from '../resolve/util.js';
import type { Hex, ResolvedDescriptor } from '../types/descriptor.js';
import type {
  Address,
  Confidence,
  DecodeOptions,
  DecodeSource,
  DecodedField,
  SecurityWarning,
  TrustReport,
} from './types.js';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export function asAddress(value: string): Address {
  return value as Address;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

export function intentFromFormat(
  intent: unknown,
  interpolated: unknown,
  fields: DecodedField[],
  locale: string
): string {
  if (typeof interpolated === 'string' && interpolated.length > 0) {
    const replaced = interpolated.replace(/\{([^{}]+)\}/g, (full, path: string) => {
      const match = fields.find(
        (field) => field.path === path || field.path === `#.${path}` || field.path.endsWith(path)
      );
      return match ? match.value : full;
    });
    if (!/\{[^{}]+\}/.test(replaced)) {
      return replaced;
    }
  }
  if (typeof intent === 'string' && intent.length > 0) {
    return intent;
  }
  if (isPlainObject(intent)) {
    return (
      (typeof intent[locale] === 'string' && intent[locale]) ||
      (typeof intent.en === 'string' && intent.en) ||
      (Object.values(intent).find((value) => typeof value === 'string') as string | undefined) ||
      'Contract interaction'
    );
  }
  return 'Contract interaction';
}

export function confidenceFor(source: DecodeSource, accepted: boolean): Confidence {
  if (source === 'official-registry' || source === 'attested') {
    return accepted ? 'high' : 'low';
  }
  if (source === 'local-override') {
    return accepted ? 'medium' : 'low';
  }
  return 'low';
}

export function stubTrust(source: DecodeSource, hash?: Hex): TrustReport {
  const accepted =
    source === 'official-registry' || source === 'attested' || source === 'local-override';
  return {
    accepted,
    policy: 'unspecified',
    descriptorHash: hash,
    reasons: accepted
      ? [`source "${source}" accepted`]
      : [`source "${source}" rejected`, 'untrusted_descriptor'],
  };
}

export function sourceFromResolved(
  resolved: ResolvedDescriptor,
  fallback: DecodeSource = 'official-registry'
): DecodeSource {
  return resolved.source ?? fallback;
}

export function finalizeTrust(
  report: TrustReport,
  source: DecodeSource,
  descriptor: ResolvedDescriptor | undefined,
  policyId?: string
): TrustReport {
  const accepted = Boolean(report.accepted);
  const reasons =
    Array.isArray(report.reasons) && report.reasons.length > 0
      ? report.reasons
      : accepted
        ? [`source "${source}" accepted`]
        : [`source "${source}" rejected`];
  return {
    accepted,
    policy: report.policy || policyId || 'unspecified',
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
  chainId: number,
  address?: Address
): Promise<TrustReport> {
  if (options?.trust) {
    const report = await options.trust.evaluate({
      descriptor,
      chainId,
      address,
      source,
    });
    return finalizeTrust(report, source, descriptor, options.trust.id);
  }
  return stubTrust(source, descriptor?.hash);
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
