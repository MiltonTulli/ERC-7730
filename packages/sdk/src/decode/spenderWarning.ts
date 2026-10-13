import type { ResolvedDescriptor } from '../types/descriptor';
import { ADDRESS_RE, toBigInt } from '../util';
import { parseDeclaration, wellKnownAliases } from './abi';
import { asAddress, resolveTrust, sourceFromResolved } from './common';
import type { Address, DecodeOptions, SecurityWarning } from './types';
import type { WarningScan } from './warnings';

export const DEADLINE_PATH = /(?:^|[.[\]])(deadline|expiry|expiration|sigDeadline)$/i;
const SPENDER_PATH = /(?:^|[.[\]])(spender|operator)$/i;
const SPENDER_FUNCTIONS =
  /^(approve|permit|setApprovalForAll|increaseAllowance|decreaseAllowance)$/i;

/** Spender argument index when the display fields omit a named spender. */
const SPENDER_ARG_INDEX: Record<string, number> = {
  approve: 0,
  permit: 1,
  setapprovalforall: 0,
  increaseallowance: 0,
  decreaseallowance: 0,
};

export const DEADLINE_ARG_INDEX: Record<string, number> = {
  permit: 3,
};

function addressOf(value: unknown): Address | undefined {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) {
    return undefined;
  }
  return asAddress(value.toLowerCase());
}

export interface NamedValue {
  path: string;
  value: unknown;
}

export function collectNamedValues(scan: WarningScan): NamedValue[] {
  const out: NamedValue[] = [];
  const seen = new Set<string>();
  const push = (path: string, value: unknown) => {
    const key = path.toLowerCase();
    if (!path || seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push({ path, value });
  };

  for (const field of scan.fields) {
    push(field.path, field.rawValue);
  }
  if (scan.message) {
    for (const [key, value] of Object.entries(scan.message)) {
      push(key, value);
    }
  }
  if (scan.args) {
    const declaration = scan.signature ? parseDeclaration(scan.signature) : null;
    const aliases = declaration ? wellKnownAliases(declaration.canonical) : undefined;
    for (let i = 0; i < scan.args.length; i++) {
      const name = declaration?.params[i]?.name ?? aliases?.[i];
      if (name) {
        push(name, scan.args[i]);
      }
      push(`[${i}]`, scan.args[i]);
    }
  }
  return out;
}

export function expiredDeadlineWarning(
  path: string,
  value: unknown,
  now: number,
  encoding?: string
): SecurityWarning | undefined {
  if (!DEADLINE_PATH.test(path)) {
    return undefined;
  }
  if (encoding === 'blockheight') {
    return undefined;
  }
  const ts = toBigInt(value);
  if (ts === undefined) {
    return undefined;
  }
  if (ts >= BigInt(now)) {
    return undefined;
  }
  return {
    type: 'expired_deadline',
    severity: 'medium',
    message: 'This deadline has already passed',
    path,
  };
}

function spenderFromScan(
  scan: WarningScan,
  functionName: string | undefined,
  values: readonly NamedValue[]
): { address: Address; path: string } | undefined {
  for (const item of values) {
    if (SPENDER_PATH.test(item.path)) {
      const address = addressOf(item.value);
      if (address) {
        return { address, path: item.path };
      }
    }
  }
  for (const field of scan.fields) {
    if (typeof field.label === 'string' && /^(spender|operator)$/i.test(field.label)) {
      const address = addressOf(field.rawValue);
      if (address) {
        return { address, path: field.path };
      }
    }
  }
  if (!functionName || !SPENDER_FUNCTIONS.test(functionName)) {
    return undefined;
  }
  const index = SPENDER_ARG_INDEX[functionName.toLowerCase()] ?? 0;
  const fromArgs = addressOf(scan.args?.[index]);
  if (fromArgs) {
    return { address: fromArgs, path: `[${index}]` };
  }
  const field = scan.fields[index];
  const fromField = field ? addressOf(field.rawValue) : undefined;
  return field && fromField ? { address: fromField, path: field.path } : undefined;
}

function descriptorCoversAddress(
  resolved: ResolvedDescriptor,
  chainId: number,
  address: Address
): boolean {
  if (resolved.deployments.length === 0) {
    return true;
  }
  const want = address.toLowerCase();
  return resolved.deployments.some(
    (item) => item.chainId === chainId && item.address.toLowerCase() === want
  );
}

async function lookupSpender(
  spender: Address,
  chainId: number,
  options: DecodeOptions | undefined
): Promise<ResolvedDescriptor | null> {
  const registry = options?.registry;
  if (!registry) {
    return null;
  }
  const key = {
    chainId,
    address: spender,
    provider: options?.provider,
    fromBlock: options?.fromBlock,
    toBlock: options?.toBlock,
  };
  try {
    const found = await registry.findCalldata(key);
    if (found && descriptorCoversAddress(found, chainId, spender)) {
      return found;
    }
  } catch (error) {
    // Spender lookup must not fail decode.
    options?.diagnosticLog?.push({
      stage: 'registry-lookup',
      outcome: 'error',
      code: 'SPENDER_LOOKUP_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const findEip712 = registry.findEip712;
  if (typeof findEip712 !== 'function') {
    return null;
  }
  try {
    const found = await findEip712.call(registry, key);
    if (found && descriptorCoversAddress(found, chainId, spender)) {
      return found;
    }
  } catch (error) {
    options?.diagnosticLog?.push({
      stage: 'registry-lookup',
      outcome: 'error',
      code: 'SPENDER_LOOKUP_FAILED',
      message: error instanceof Error ? error.message : String(error),
      details: { kind: 'eip712' },
    });
    return null;
  }
  return null;
}

function allowlistedSpender(spender: Address, options: DecodeOptions | undefined): boolean {
  const list = options?.spenderAllowlist;
  if (!list || list.length === 0) {
    return false;
  }
  const want = spender.toLowerCase();
  return list.some((entry) => entry.toLowerCase() === want);
}

export async function untrustedSpenderWarning(
  scan: WarningScan,
  functionName: string | undefined,
  chainId: number,
  options: DecodeOptions | undefined,
  values: readonly NamedValue[] = collectNamedValues(scan)
): Promise<SecurityWarning | undefined> {
  const spender = spenderFromScan(scan, functionName, values);
  if (!spender) {
    return undefined;
  }
  if (allowlistedSpender(spender.address, options)) {
    return undefined;
  }
  const found = await lookupSpender(spender.address, chainId, options);
  if (found) {
    const source = sourceFromResolved(found);
    const trust = await resolveTrust(options, source, found, chainId, spender.address);
    if (trust.accepted) {
      return undefined;
    }
  } else {
    const trust = await resolveTrust(options, 'inferred', undefined, chainId, spender.address);
    if (trust.accepted) {
      return undefined;
    }
  }
  return {
    type: 'untrusted_spender',
    severity: 'high',
    message: 'Spender is not in the registry or was not accepted by the trust policy',
    path: spender.path,
  };
}
