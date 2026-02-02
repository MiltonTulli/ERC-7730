export * from './erc7730.js';

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
 * ClearSigner configuration
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
