export * from './erc7730.js';
export * from './descriptor.js';
export * from './v2.js';

/**
 * Transaction input for decoding
 */
export interface TransactionInput {
  /** Contract address */
  to: string;
  /** Calldata (hex string) */
  data: string;
  /** Value in wei (optional) */
  value?: string | bigint;
  /** Chain ID */
  chainId: number;
  /** Sender address (optional, used for context) */
  from?: string;
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
  custom?: import('./erc7730.js').ERC7730Descriptor[];
}

/**
 * Supported chain names for convenience methods
 */
export type ChainName = 'ethereum' | 'mainnet' | 'arbitrum' | 'optimism' | 'base' | 'polygon';

/**
 * Legacy constructor config. Prefer `DecodeOptions` with `createClearSigner`.
 */
export interface ClearSignerConfig {
  /**
   * Provider for on-chain lookups (ENS, token metadata)
   * - If omitted: uses public RPC automatically
   * - If null: disables on-chain lookups entirely
   */
  provider?: Provider | null;

  /**
   * RPC URL for on-chain lookups
   * Alternative to passing a full provider
   */
  rpcUrl?: string;

  /**
   * Chain ID for auto-configuration
   * Used with rpcUrl or to select default public RPC
   */
  chainId?: number;

  /** Registry configuration */
  registry?: RegistryConfig;

  /**
   * Enable Sourcify fallback for verified contracts
   * When enabled, if no descriptor is found in the registry,
   * the SDK will try to fetch the ABI from Sourcify and generate
   * a descriptor automatically.
   * @default true
   */
  useSourcifyFallback?: boolean;
}
