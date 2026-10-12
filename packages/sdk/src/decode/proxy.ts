import type { Provider } from '../types';
import type { Hex } from '../types/descriptor';
import { ADDRESS_RE } from '../util';
import { ZERO_ADDRESS, asAddress } from './common';
import type { Address, DiagnosticLog } from './types';

/** EIP-1967 implementation slot: `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`. */
export const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex;

const EIP1167_PREFIX = '0x363d3d373d3d3d363d73';
const EIP1167_SUFFIX = '5af43d82803e903d91602b57fd5bf3';

export function normalizeAddr(value: string | undefined): Address | undefined {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) {
    return undefined;
  }
  return asAddress(value.toLowerCase());
}

export function readDeployments(value: unknown): Array<{ chainId: number; address: Address }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Array<{ chainId: number; address: Address }> = [];
  for (const item of value) {
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      typeof (item as { chainId?: unknown }).chainId !== 'number' ||
      typeof (item as { address?: unknown }).address !== 'string'
    ) {
      continue;
    }
    const record = item as { chainId: number; address: string };
    const address = normalizeAddr(record.address);
    if (!address) {
      continue;
    }
    out.push({ chainId: record.chainId, address });
  }
  return out;
}

export function deploymentsInclude(
  deployments: Array<{ chainId: number; address: Address }>,
  chainId: number,
  address: Address
): boolean {
  const want = address.toLowerCase();
  return deployments.some((item) => item.chainId === chainId && item.address === want);
}

export function deploymentsHaveChain(
  deployments: Array<{ chainId: number; address: Address }>,
  chainId: number
): boolean {
  return deployments.some((item) => item.chainId === chainId);
}

function addressFromWord(word: string | null | undefined): Address | undefined {
  if (typeof word !== 'string' || !word.startsWith('0x')) {
    return undefined;
  }
  const hex = word.slice(2).replace(/^0+/, '').padStart(40, '0');
  if (hex.length !== 40 || !/^[0-9a-fA-F]{40}$/.test(hex)) {
    return undefined;
  }
  const address = asAddress(`0x${hex.toLowerCase()}`);
  if (address === ZERO_ADDRESS) {
    return undefined;
  }
  return address;
}

function thrownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read the implementation address of a well-known proxy. Custom slots (Safe
 * singleton at slot 0, etc.) are not guessed.
 */
export async function resolveImplementation(
  address: Address,
  provider: Provider | null | undefined,
  log?: DiagnosticLog
): Promise<Address | undefined> {
  if (!provider) {
    return undefined;
  }

  if (typeof provider.getStorageAt === 'function') {
    try {
      const word = await provider.getStorageAt({
        address: asAddress(address),
        slot: EIP1967_IMPLEMENTATION_SLOT,
      });
      const impl = addressFromWord(word ?? undefined);
      if (impl) {
        return impl;
      }
    } catch (error) {
      log?.push({
        stage: 'context-match',
        outcome: 'error',
        code: 'IMPLEMENTATION_LOOKUP_FAILED',
        message: thrownMessage(error),
        details: { address, via: 'eip1967' },
      });
    }
  }

  if (typeof provider.getCode === 'function') {
    try {
      const code = await provider.getCode({ address: asAddress(address) });
      const hex = typeof code === 'string' ? code.toLowerCase() : '';
      if (hex.startsWith(EIP1167_PREFIX) && hex.endsWith(EIP1167_SUFFIX)) {
        const middle = hex.slice(EIP1167_PREFIX.length, hex.length - EIP1167_SUFFIX.length);
        const impl = middle.length === 40 ? normalizeAddr(`0x${middle}`) : undefined;
        if (impl) {
          return impl;
        }
      }
    } catch (error) {
      log?.push({
        stage: 'context-match',
        outcome: 'error',
        code: 'IMPLEMENTATION_LOOKUP_FAILED',
        message: thrownMessage(error),
        details: { address, via: 'eip1167' },
      });
      return undefined;
    }
  }

  return undefined;
}
