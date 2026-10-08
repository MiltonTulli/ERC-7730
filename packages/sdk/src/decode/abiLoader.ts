import type { Address, VerifiedContractAbi } from './types';

/** Per-call verified-ABI loader. There is no process-wide default. */
export type VerifiedAbiLoader = (
  chainId: number,
  address: Address
) => Promise<VerifiedContractAbi | null>;
