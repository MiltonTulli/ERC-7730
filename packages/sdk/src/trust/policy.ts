import type {
  Address,
  DecodeSource,
  TrustContext,
  TrustPolicy,
  TrustReport,
} from '../decode/types.js';

const OFFICIAL_SOURCES: ReadonlySet<DecodeSource> = new Set(['official-registry', 'attested']);

const OFFICIAL_OR_LOCAL_SOURCES: ReadonlySet<DecodeSource> = new Set([
  'official-registry',
  'attested',
  'local-override',
]);

function reportFor(
  id: string,
  ctx: TrustContext,
  acceptedSources: ReadonlySet<DecodeSource>
): TrustReport {
  const accepted = acceptedSources.has(ctx.source);
  return {
    accepted,
    policy: id,
    descriptorHash: ctx.descriptor?.hash,
    reasons: accepted
      ? [`source "${ctx.source}" accepted`]
      : [`source "${ctx.source}" rejected`, 'untrusted_descriptor'],
  };
}

/**
 * Accept only a pinned official-registry (or attested) descriptor.
 * Sourcify / generated / inferred / basic / local-override are rejected.
 */
export function officialOnlyPolicy(): TrustPolicy {
  return {
    id: 'official-only',
    evaluate(ctx) {
      return reportFor('official-only', ctx, OFFICIAL_SOURCES);
    },
  };
}

/**
 * Accept a pinned official-registry descriptor or an app `extend()` override.
 * Sourcify / generated / inferred / basic are still rejected.
 */
export function officialOrLocalPolicy(): TrustPolicy {
  return {
    id: 'official-or-local',
    evaluate(ctx) {
      return reportFor('official-or-local', ctx, OFFICIAL_OR_LOCAL_SOURCES);
    },
  };
}

function uniqueAddresses(values: Address[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Combine policies. `all` requires every child to accept; `any` accepts if one does.
 * Children are always evaluated so `reasons` stay complete.
 */
export function composePolicies(policies: TrustPolicy[], mode: 'all' | 'any'): TrustPolicy {
  if (mode !== 'all' && mode !== 'any') {
    throw new TypeError('composePolicies mode must be "all" or "any"');
  }

  const id = mode === 'all' ? 'compose:all' : 'compose:any';

  return {
    id,
    async evaluate(ctx) {
      if (policies.length === 0) {
        return {
          accepted: false,
          policy: id,
          descriptorHash: ctx.descriptor?.hash,
          reasons: ['no policies to compose'],
        };
      }

      const reports: TrustReport[] = [];
      for (const policy of policies) {
        reports.push(await policy.evaluate(ctx));
      }

      const accepted =
        mode === 'all'
          ? reports.every((report) => report.accepted)
          : reports.some((report) => report.accepted);

      const contributing = accepted
        ? mode === 'any'
          ? reports.filter((report) => report.accepted)
          : reports
        : reports.filter((report) => !report.accepted);

      const reasons = contributing.flatMap((report) => report.reasons);
      const attesters = uniqueAddresses(reports.flatMap((report) => report.attesters ?? []));
      const descriptorHash =
        reports.find((report) => report.descriptorHash)?.descriptorHash ?? ctx.descriptor?.hash;

      return {
        accepted,
        policy: id,
        descriptorHash,
        attesters: attesters.length > 0 ? attesters : undefined,
        reasons:
          reasons.length > 0
            ? reasons
            : [accepted ? `source "${ctx.source}" accepted` : `source "${ctx.source}" rejected`],
      };
    },
  };
}
