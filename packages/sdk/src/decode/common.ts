import { isPlainObject } from '../resolve/util.js';
import type { Hex, ResolvedDescriptor } from '../types/descriptor.js';
import type {
  Address,
  Confidence,
  DecodeOptions,
  DecodeSource,
  DecodedField,
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
    reasons: accepted ? [] : [`source "${source}" is untrusted until TrustPolicy (#11)`],
  };
}

export async function resolveTrust(
  options: DecodeOptions | undefined,
  source: DecodeSource,
  descriptor: ResolvedDescriptor | undefined,
  chainId: number,
  address?: Address
): Promise<TrustReport> {
  if (options?.trust) {
    return options.trust.evaluate({
      descriptor,
      chainId,
      address,
      source,
    });
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
