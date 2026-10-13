import { matchContext, resolveImplementation } from '../decode/context';
import { eip712FormatMatchesLookup } from '../decode/match';
import type { DiagnosticLog } from '../decode/types';
import { isPlainObject } from '../resolve/util';
import type { LogBlockTag, Provider, TypedDataInput } from '../types';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor';

export interface OverrideLookupKey {
  chainId: number;
  address: string;
  typedData?: TypedDataInput;
  provider?: Provider | null;
  fromBlock?: bigint | LogBlockTag;
  toBlock?: bigint | LogBlockTag;
  diagnosticLog?: DiagnosticLog;
}

function overrideKind(resolved: ResolvedDescriptor): 'calldata' | 'eip712' | null {
  const context = isPlainObject(resolved.merged.context) ? resolved.merged.context : undefined;
  if (!context) {
    return null;
  }
  if (isPlainObject(context.contract)) {
    return 'calldata';
  }
  if (isPlainObject(context.eip712)) {
    return 'eip712';
  }
  return null;
}

function deploymentsHit(resolved: ResolvedDescriptor, chainId: number, address: string): boolean {
  const want = address.toLowerCase();
  return resolved.deployments.some(
    (item) => item.chainId === chainId && item.address.toLowerCase() === want
  );
}

/** First matching override wins. An implementation deployment hits before `matchContext`. */
export async function findOverride(
  overrides: readonly InputDescriptor[],
  resolveOverride: (input: InputDescriptor) => Promise<ResolvedDescriptor>,
  key: OverrideLookupKey,
  kind: 'calldata' | 'eip712'
): Promise<ResolvedDescriptor | null> {
  const address = key.address.toLowerCase();
  const impl = await resolveImplementation(address as `0x${string}`, key.provider);
  for (const input of overrides) {
    const resolved = await resolveOverride(input);
    if (overrideKind(resolved) !== kind) {
      continue;
    }
    if (kind === 'eip712' && !eip712FormatMatchesLookup(resolved.merged, key)) {
      continue;
    }
    if (deploymentsHit(resolved, key.chainId, address)) {
      return resolved;
    }
    if (impl && impl !== address && deploymentsHit(resolved, key.chainId, impl)) {
      return resolved;
    }
    const matchOptions = {
      provider: key.provider,
      fromBlock: key.fromBlock,
      toBlock: key.toBlock,
      diagnosticLog: key.diagnosticLog,
    };
    if (kind === 'eip712') {
      if (!key.typedData) {
        continue;
      }
      const bound = await matchContext(resolved, key.typedData, matchOptions);
      if (bound.matched) {
        return resolved;
      }
      continue;
    }
    const bound = await matchContext(
      resolved,
      { to: address as `0x${string}`, data: '0x', chainId: key.chainId },
      matchOptions
    );
    if (bound.matched) {
      return resolved;
    }
  }
  return null;
}
