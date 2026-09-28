import type { Address, VerifiedContractAbi } from './types';

export type VerifiedAbiLoader = (
  chainId: number,
  address: Address
) => Promise<VerifiedContractAbi | null>;

let defaultLoader: VerifiedAbiLoader | undefined;

/**
 * Advanced hook for a process-wide verified-ABI loader.
 * Package entries do not call this. Callers opt in with an explicit loader.
 */
export function setDefaultVerifiedAbiLoader(loader: VerifiedAbiLoader | undefined): void {
  defaultLoader = loader;
}

export function getDefaultVerifiedAbiLoader(): VerifiedAbiLoader | undefined {
  return defaultLoader;
}
