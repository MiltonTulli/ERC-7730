import type { Address, VerifiedContractAbi } from './types.js';

export type VerifiedAbiLoader = (
  chainId: number,
  address: Address
) => Promise<VerifiedContractAbi | null>;

let defaultLoader: VerifiedAbiLoader | undefined;

/** Registered by the full package entry so lite never imports Sourcify. */
export function setDefaultVerifiedAbiLoader(loader: VerifiedAbiLoader | undefined): void {
  defaultLoader = loader;
}

export function getDefaultVerifiedAbiLoader(): VerifiedAbiLoader | undefined {
  return defaultLoader;
}
