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

type OverrideSlot = { ok: true; resolved: ResolvedDescriptor } | { ok: false; error: unknown };

interface OverrideIndex {
  /** Length of the `extend()` list this index was built from. */
  size: number;
  slots: OverrideSlot[];
  /** `${chainId}:${address}` → override positions, in `extend()` order. */
  byDeployment: Map<string, number[]>;
  /** Positions that can match without a listed deployment (factory or EIP-712 context). */
  contextual: Record<'calldata' | 'eip712', number[]>;
  /** Positions whose resolve rejected. Their kind is unknown, so every lookup reaches them. */
  failed: number[];
}

const indexes = new WeakMap<readonly InputDescriptor[], Promise<OverrideIndex>>();

function deploymentKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function hasFactory(resolved: ResolvedDescriptor): boolean {
  const context = isPlainObject(resolved.merged.context) ? resolved.merged.context : undefined;
  const contract = context && isPlainObject(context.contract) ? context.contract : undefined;
  return contract !== undefined && isPlainObject(contract.factory);
}

async function buildIndex(
  overrides: readonly InputDescriptor[],
  resolveOverride: (input: InputDescriptor) => Promise<ResolvedDescriptor>
): Promise<OverrideIndex> {
  // Snapshot first: an `extend()` during the await fails the size check and triggers a rebuild.
  const snapshot = [...overrides];
  const settled = await Promise.allSettled(snapshot.map((input) => resolveOverride(input)));
  const index: OverrideIndex = {
    size: snapshot.length,
    slots: [],
    byDeployment: new Map(),
    contextual: { calldata: [], eip712: [] },
    failed: [],
  };
  settled.forEach((result, position) => {
    if (result.status === 'rejected') {
      index.slots.push({ ok: false, error: result.reason });
      index.failed.push(position);
      return;
    }
    const item = result.value;
    index.slots.push({ ok: true, resolved: item });
    for (const deployment of item.deployments) {
      const key = deploymentKey(deployment.chainId, deployment.address);
      const list = index.byDeployment.get(key);
      if (list) {
        list.push(position);
      } else {
        index.byDeployment.set(key, [position]);
      }
    }
    const kind = overrideKind(item);
    if (kind === 'eip712') {
      index.contextual.eip712.push(position);
    } else if (kind === 'calldata' && hasFactory(item)) {
      index.contextual.calldata.push(position);
    }
  });
  return index;
}

/**
 * Index of `overrides`, rebuilt when `extend()` appends to the list. An index
 * with failed slots is not kept, so the next lookup retries those resolves.
 */
async function overrideIndex(
  overrides: readonly InputDescriptor[],
  resolveOverride: (input: InputDescriptor) => Promise<ResolvedDescriptor>
): Promise<OverrideIndex> {
  const cached = indexes.get(overrides);
  if (cached) {
    const index = await cached;
    if (index.size === overrides.length) {
      return index;
    }
  }
  const pending = buildIndex(overrides, resolveOverride);
  indexes.set(overrides, pending);
  const index = await pending;
  if (index.failed.length > 0 && indexes.get(overrides) === pending) {
    indexes.delete(overrides);
  }
  return index;
}

function candidatePositions(
  index: OverrideIndex,
  chainId: number,
  addresses: readonly string[],
  kind: 'calldata' | 'eip712'
): number[] {
  const positions = new Set<number>([...index.contextual[kind], ...index.failed]);
  for (const address of addresses) {
    for (const position of index.byDeployment.get(deploymentKey(chainId, address)) ?? []) {
      positions.add(position);
    }
  }
  return [...positions].sort((a, b) => a - b);
}

function deploymentsHit(resolved: ResolvedDescriptor, chainId: number, address: string): boolean {
  const want = address.toLowerCase();
  return resolved.deployments.some(
    (item) => item.chainId === chainId && item.address.toLowerCase() === want
  );
}

/**
 * First matching override wins. An implementation deployment hits before `matchContext`.
 * Only overrides listing the address (or its implementation), factory overrides,
 * EIP-712 overrides, and failed resolves are checked. A failed resolve throws only
 * when no earlier override matched.
 */
export async function findOverride(
  overrides: readonly InputDescriptor[],
  resolveOverride: (input: InputDescriptor) => Promise<ResolvedDescriptor>,
  key: OverrideLookupKey,
  kind: 'calldata' | 'eip712'
): Promise<ResolvedDescriptor | null> {
  if (overrides.length === 0) {
    return null;
  }
  const address = key.address.toLowerCase();
  const impl = await resolveImplementation(address as `0x${string}`, key.provider);
  const index = await overrideIndex(overrides, resolveOverride);
  const addresses = impl && impl !== address ? [address, impl] : [address];
  for (const position of candidatePositions(index, key.chainId, addresses, kind)) {
    const slot = index.slots[position];
    if (!slot.ok) {
      throw slot.error;
    }
    const resolved = slot.resolved;
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
