export * from './descriptor';
export * from './v2';

/**
 * Transaction input for decoding
 */
export interface TransactionInput {
  /** Contract address */
  to: `0x${string}`;
  /** Calldata (even-length hex, at least `0x`) */
  data: `0x${string}`;
  /** Value in wei (optional). A non-negative integer. */
  value?: string | bigint;
  /** Chain ID. A positive integer. */
  chainId: number;
  /** Sender address (optional, used for context) */
  from?: `0x${string}`;
}

/**
 * EIP-712 typed-data payload for `decodeTypedData`.
 */
export interface TypedDataInput {
  chainId?: number;
  domain: {
    name?: string;
    version?: string;
    chainId?: number | bigint;
    verifyingContract?: `0x${string}`;
    salt?: `0x${string}`;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** Block tags accepted by `eth_getLogs` / viem `PublicClient.getLogs`. */
export type LogBlockTag = 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized';

/**
 * Provider interface - compatible with viem's PublicClient
 */
export interface Provider {
  /** Read contract function */
  readContract?: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;

  /** Get ENS name for address */
  getEnsName?: (args: { address: `0x${string}` }) => Promise<string | null>;

  /** Get ENS address for name */
  getEnsAddress?: (args: { name: string }) => Promise<`0x${string}` | null>;

  /** Storage slot read (EIP-1967 proxy implementation). */
  getStorageAt?: (args: {
    address: `0x${string}`;
    slot: `0x${string}`;
  }) => Promise<`0x${string}` | null | undefined>;

  /** Account bytecode (EIP-1167 minimal proxy). */
  getCode?: (args: { address: `0x${string}` }) => Promise<`0x${string}` | null | undefined>;

  /**
   * Logs for `context.contract.factory.deployEvent`.
   * Parameter shape is a subset of viem `PublicClient.getLogs`.
   */
  getLogs?: (args: {
    address?: `0x${string}` | `0x${string}`[];
    topics?: (`0x${string}` | (`0x${string}` | null)[] | null)[];
    fromBlock?: bigint | LogBlockTag;
    toBlock?: bigint | LogBlockTag;
  }) => Promise<
    Array<{
      address: `0x${string}`;
      topics: readonly `0x${string}`[];
      data: `0x${string}`;
    }>
  >;

  /** Chain ID */
  chain?: { id: number };
}

/**
 * Registry configuration
 */
export interface RegistryConfig {
  /** Use built-in descriptors (default: true) */
  embedded?: boolean;

  /** Additional custom descriptors */
  custom?: import('./descriptor').InputDescriptor[];
}

/**
 * Supported chain names for convenience methods
 */
export type ChainName = 'ethereum' | 'mainnet' | 'arbitrum' | 'optimism' | 'base' | 'polygon';
