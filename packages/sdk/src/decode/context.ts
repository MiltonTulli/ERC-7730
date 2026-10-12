/**
 * ERC-7730 v2 context matching.
 *
 * A descriptor is applied only when the transaction / typed-data payload
 * satisfies `context`. Matching uses the official schema:
 *   - `contract.deployments` (exact chainId + address)
 *   - EIP-1967 implementation slot / EIP-1167 bytecode (proxy → a deployment)
 *   - `contract.factory` (`deployments` + `deployEvent` signature, decoded via ABI)
 *   - `eip712.domain` / `eip712.deployments` / `eip712.domainSeparator`
 *
 * `addressMatcher` URLs are not fetched (v1 draft; absent from v2). Unknown
 * addresses fail closed. Factory event layouts are taken from `deployEvent`,
 * not hardcoded.
 */

import { isPlainObject } from '../resolve/util';
import type { LogBlockTag, Provider, TransactionInput, TypedDataInput } from '../types';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor';
import { asRecord } from './common';
import { matchEip712Context } from './eip712Domain';
import { matchFactory } from './factory';
import {
  deploymentsHaveChain,
  deploymentsInclude,
  normalizeAddr,
  readDeployments,
  resolveImplementation,
} from './proxy';
import type { Address, DiagnosticLog } from './types';

export { EIP1967_IMPLEMENTATION_SLOT, resolveImplementation } from './proxy';

export type ContextMatchVia = 'deployment' | 'factory' | 'proxy' | 'eip712';

export type ContextMismatchReason = 'chain_id' | 'address' | 'unmatched';

export interface ContextMatch {
  matched: boolean;
  via?: ContextMatchVia;
  /** Set when `matched` is false. */
  reason?: ContextMismatchReason;
}

export interface MatchContextOptions {
  provider?: Provider | null;
  /**
   * Factory log range. `eth_getLogs` defaults omitted bounds to `latest`,
   * which would miss historical deploy events. Unset values become
   * `earliest` / `latest`. Pass a bounded range on public RPCs.
   */
  fromBlock?: bigint | LogBlockTag;
  toBlock?: bigint | LogBlockTag;
  /** Receives proxy and factory lookup failures. Decode continues either way. */
  diagnosticLog?: DiagnosticLog;
}

type DescriptorLike = InputDescriptor | ResolvedDescriptor;

function isResolved(descriptor: DescriptorLike): descriptor is ResolvedDescriptor {
  return (
    isPlainObject(descriptor) &&
    'merged' in descriptor &&
    'hash' in descriptor &&
    'input' in descriptor &&
    'deployments' in descriptor
  );
}

function mergedOf(descriptor: DescriptorLike): InputDescriptor {
  return isResolved(descriptor) ? descriptor.merged : descriptor;
}

function isTypedData(target: TransactionInput | TypedDataInput): target is TypedDataInput {
  return (
    isPlainObject(target) && 'domain' in target && 'primaryType' in target && 'types' in target
  );
}

async function matchContractContext(
  contract: Record<string, unknown>,
  chainId: number,
  address: Address,
  options: MatchContextOptions | undefined
): Promise<ContextMatch> {
  const deployments = readDeployments(contract.deployments);
  const factory = asRecord(contract.factory);
  const hasFactory = factory !== undefined && typeof factory.deployEvent === 'string';

  if (deployments.length === 0 && !hasFactory) {
    return { matched: false, reason: 'unmatched' };
  }

  if (deployments.length > 0 && deploymentsInclude(deployments, chainId, address)) {
    return { matched: true, via: 'deployment' };
  }

  if (deployments.length > 0) {
    const impl = await resolveImplementation(address, options?.provider, options?.diagnosticLog);
    if (impl && deploymentsInclude(deployments, chainId, impl)) {
      return { matched: true, via: 'proxy' };
    }
  }

  if (hasFactory && factory && (await matchFactory(factory, chainId, address, options))) {
    return { matched: true, via: 'factory' };
  }

  if (deployments.length > 0 && !deploymentsHaveChain(deployments, chainId)) {
    return { matched: false, reason: 'chain_id' };
  }
  return { matched: false, reason: deployments.length > 0 ? 'address' : 'unmatched' };
}

/**
 * Whether `descriptor` may be applied to `target`.
 *
 * Used by `decodeTransaction` / `decodeTypedData` and by registry lookup so a
 * familiar selector on an unbound address never yields `confidence: "high"`.
 */
export async function matchContext(
  descriptor: DescriptorLike,
  target: TransactionInput | TypedDataInput,
  options?: MatchContextOptions
): Promise<ContextMatch> {
  const merged = mergedOf(descriptor);
  const context = asRecord(merged.context);
  if (!context) {
    return { matched: false, reason: 'unmatched' };
  }

  if (isTypedData(target)) {
    const eip712 = asRecord(context.eip712);
    if (!eip712) {
      return { matched: false, reason: 'unmatched' };
    }
    return matchEip712Context(eip712, target, options);
  }

  const contract = asRecord(context.contract);
  if (!contract) {
    return { matched: false, reason: 'unmatched' };
  }
  const address = normalizeAddr(target.to);
  if (!address || typeof target.chainId !== 'number') {
    return { matched: false, reason: 'unmatched' };
  }
  return matchContractContext(contract, target.chainId, address, options);
}
