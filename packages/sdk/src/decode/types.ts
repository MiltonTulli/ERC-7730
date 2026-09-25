import type { OfficialRegistry } from '../official-registry/types.js';
import type { Hex, ResolvedDescriptor } from '../types/descriptor.js';
import type { LogBlockTag, Provider, TransactionInput, TypedDataInput } from '../types/index.js';

export type Address = `0x${string}`;

export type Confidence = 'high' | 'medium' | 'low';

export type DecodeSource =
  | 'official-registry'
  | 'attested'
  | 'local-override'
  | 'trusted-token'
  | 'sourcify'
  | 'generated'
  | 'inferred'
  | 'basic';

/**
 * v2 schema uses `addressName`. The issue / ROADMAP name `addressOrName` is
 * accepted as an alias when reading descriptors.
 */
export type FieldFormat =
  | 'raw'
  | 'amount'
  | 'tokenAmount'
  | 'nftName'
  | 'date'
  | 'duration'
  | 'addressOrName'
  | 'addressName'
  | 'enum'
  | 'unit'
  | 'tokenTicker'
  | 'calldata'
  | 'chainId'
  | 'interoperableAddressName';

export interface DecodedField {
  path: string;
  label: string;
  format: FieldFormat;
  value: string;
  rawValue: unknown;
  required: boolean;
  params?: Record<string, unknown>;
  /** Inner `decodeTransaction` when `format` is `calldata`. Not Multicall3. */
  embedded?: DecodedOperation;
}

/**
 * Source of truth for `SecurityWarning.type`. Adding a check here is what
 * keeps it in the public union; do not maintain a parallel type list.
 */
export const SECURITY_WARNING_TYPES = [
  'infinite_approval',
  'dangerous_permissions',
  'untrusted_descriptor',
  'untrusted_spender',
  'ownership_change',
  'proxy_upgrade',
  'expired_deadline',
  'selector_mismatch',
  'missing_metadata',
  'interpolation_failed',
  'NO_TRUSTED_ATTESTATION',
] as const;

export type SecurityWarningType = (typeof SECURITY_WARNING_TYPES)[number];

export interface SecurityWarning {
  type: SecurityWarningType;
  severity: 'high' | 'medium' | 'low';
  message: string;
  path?: string;
}

export interface TrustReport {
  accepted: boolean;
  policy: string;
  descriptorHash?: Hex;
  attesters?: Address[];
  reasons: string[];
}

export interface TrustContext {
  descriptor?: ResolvedDescriptor;
  chainId: number;
  address?: Address;
  source: DecodeSource;
}

export interface TrustPolicy {
  readonly id: string;
  evaluate(ctx: TrustContext): Promise<TrustReport> | TrustReport;
}

export interface DecodedOperation {
  confidence: Confidence;
  source: DecodeSource;
  intent: string;
  /**
   * Sentence with field values filled in. Omitted when the descriptor has no
   * template or a `{path}` placeholder cannot be resolved.
   */
  interpolatedIntent?: string;
  functionName?: string;
  signature?: string;
  selector?: Hex;
  fields: DecodedField[];
  excluded: string[];
  warnings: SecurityWarning[];
  trust: TrustReport;
  metadata: {
    owner?: string;
    contractName?: string;
    protocolUrl?: string;
    chainId: number;
    contractAddress?: Address;
    descriptorId?: string;
    registryPath?: string;
  };
  raw: {
    selector?: Hex;
    args?: readonly unknown[];
    message?: Record<string, unknown>;
  };
}

export interface DecodeRegistry {
  findCalldata(key: {
    chainId: number;
    address: Address;
    selector?: Hex;
    signature?: string;
    provider?: Provider | null;
    fromBlock?: bigint | LogBlockTag;
    toBlock?: bigint | LogBlockTag;
  }): Promise<ResolvedDescriptor | null>;
  findEip712?(key: {
    chainId: number;
    address: Address;
    signature?: string;
    encodeTypeHash?: Hex;
    provider?: Provider | null;
    fromBlock?: bigint | LogBlockTag;
    toBlock?: bigint | LogBlockTag;
  }): Promise<ResolvedDescriptor | null>;
}

export type TrustedTokenStandard = 'erc20' | 'erc721';

/** chainId → address → standard. Addresses are matched case-insensitively. */
export type TrustedTokens = Record<number, Record<string, TrustedTokenStandard>>;

export interface TokenInfo {
  symbol: string;
  decimals: number;
  name?: string;
}

export interface ChainInfo {
  name: string;
  symbol: string;
  decimals?: number;
}

/**
 * Wallet-supplied reads. The decode core does not open RPC or ENS itself
 * when these methods are present.
 */
export interface ExternalDataProvider {
  resolveToken?(chainId: number, address: Address): Promise<TokenInfo | null>;
  resolveEnsName?(address: Address): Promise<string | null>;
  resolveLocalName?(address: Address): Promise<string | null>;
  resolveNftCollectionName?(chainId: number, address: Address): Promise<string | null>;
  resolveBlockTimestamp?(chainId: number, blockHeight: bigint): Promise<number | null>;
  resolveChainInfo?(chainId: number): Promise<ChainInfo | null>;
  chainClient?: {
    call(chainId: number, req: { to: Address; data: Hex }): Promise<Hex>;
  };
}

/** ABI returned by an optional verified-source adapter (Sourcify). */
export interface VerifiedContractAbi {
  abi: readonly unknown[];
  name?: string;
}

export interface DecodeOptions {
  provider?: Provider | null;
  registry?: DecodeRegistry | OfficialRegistry;
  /** Injected token, name, NFT, and chain reads. No network inside the SDK. */
  externalDataProvider?: ExternalDataProvider;
  /**
   * Bundled ERC-20 / ERC-721 templates when no registry descriptor matches.
   * Never `confidence: "high"` under `officialOnlyPolicy()`.
   */
  trustedTokens?: TrustedTokens;
  /**
   * Wallet-supplied policy. When omitted, decode uses a stub
   * (`policy: "unspecified"`) that accepts official-registry / attested /
   * local-override and rejects Sourcify / generated / inferred / basic.
   * Production should pass `officialOnlyPolicy()`.
   */
  trust?: TrustPolicy;
  /**
   * Opt-in Sourcify ABI fallback. Default false: decode does not touch the network.
   * The full `@erc7730/sdk` entry registers the client; `@erc7730/sdk/lite` does not.
   * Never `confidence: "high"`.
   */
  useSourcifyFallback?: boolean;
  /**
   * Replaces the built-in Sourcify loader. Used by tests and by the full package entry.
   */
  loadVerifiedAbi?: (chainId: number, address: Address) => Promise<VerifiedContractAbi | null>;
  /** @internal Recursion guard for nested `calldata` fields. */
  calldataDepth?: number;
  /** BCP-47 locale for dates / amounts. @default "en" */
  locale?: string;
  /**
   * Unix time in seconds for `expired_deadline`. Tests inject a frozen clock.
   * @default `Math.floor(Date.now() / 1000)`
   */
  now?: number | (() => number);
  /**
   * Factory `getLogs` range forwarded to `matchContext`.
   * Defaults: `earliest` → `latest`. Bound this on public RPCs.
   */
  fromBlock?: bigint | LogBlockTag;
  toBlock?: bigint | LogBlockTag;
}

export type { TransactionInput, TypedDataInput };
