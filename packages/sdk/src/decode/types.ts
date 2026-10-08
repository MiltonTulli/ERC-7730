import type { OfficialRegistry } from '../official-registry/types';
import type { LogBlockTag, Provider, TransactionInput, TypedDataInput } from '../types';
import type { Hex, ResolvedDescriptor } from '../types/descriptor';

export type Address = `0x${string}`;

export type Confidence = 'high' | 'medium' | 'low';

export type DecodeSource =
  | 'official-registry'
  | 'attested'
  | 'local-override'
  | 'trusted-token'
  | 'builtin'
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

export interface TokenAmountDetails {
  amount: bigint;
  token?: TokenInfo;
  isInfinite: boolean;
  nativeCurrency?: boolean;
}

export interface AddressNameDetails {
  address: Address;
  name?: string;
  nameSource?: 'descriptor' | 'provider' | 'none';
  types?: string[];
}

export interface DateDetails {
  timestamp: number;
  encoding: 'timestamp' | 'blockheight';
}

export interface EnumDetails {
  raw: string;
  resolved?: string;
}

export interface NftNameDetails {
  collection: Address;
  tokenId: bigint;
}

export interface CalldataDetails {
  /** Inner `decodeTransaction`. Not Multicall3 / batch `children`. */
  embedded: DecodedOperation;
}

export interface RawDetails {
  raw: unknown;
}

interface DecodedFieldBase {
  path: string;
  label: string;
  value: string;
  rawValue: unknown;
  /**
   * `true` when the format lists this path as required.
   * `'implicit'` when the format declares no required list.
   */
  required: boolean | 'implicit';
  params?: Record<string, unknown>;
  hidden?: boolean;
}

export type DecodedField =
  | (DecodedFieldBase & { format: 'tokenAmount'; details: TokenAmountDetails })
  | (DecodedFieldBase & { format: 'addressName'; details: AddressNameDetails })
  | (DecodedFieldBase & { format: 'date'; details: DateDetails })
  | (DecodedFieldBase & { format: 'enum'; details: EnumDetails })
  | (DecodedFieldBase & { format: 'nftName'; details: NftNameDetails })
  | (DecodedFieldBase & { format: 'calldata'; details: CalldataDetails })
  | (DecodedFieldBase & {
      format: 'raw' | 'amount' | 'duration' | 'unit' | 'chainId' | 'tokenTicker';
      details: RawDetails;
    });

export type DecodeDiagnosticStage =
  | 'input'
  | 'registry-lookup'
  | 'context-match'
  | 'format-match'
  | 'include-resolve'
  | 'trust'
  | 'fallback';

export type DecodeDiagnosticOutcome = 'hit' | 'miss' | 'skipped' | 'error';

export interface DecodeDiagnostic {
  stage: DecodeDiagnosticStage;
  outcome: DecodeDiagnosticOutcome;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticLog {
  readonly entries: DecodeDiagnostic[];
  push(entry: DecodeDiagnostic): void;
}

/** Notified when the official registry reads or fetches a file. */
export interface RegistryCacheObserver {
  hit(path: string): void;
  fetch(path: string, durationMs: number): void;
}

export type ClearSignKind = 'transaction' | 'typed-data' | 'batch' | 'user-op';

export type ClearSignEvent =
  | { type: 'decode:start'; kind: ClearSignKind }
  | {
      type: 'decode:end';
      kind: ClearSignKind;
      durationMs: number;
      source: DecodeSource;
      confidence: Confidence;
    }
  | { type: 'registry:fetch'; path: string; durationMs: number }
  | { type: 'registry:cache-hit'; path: string }
  | { type: 'registry:miss'; chainId?: number; address?: string }
  | { type: 'trust:accepted'; reasons: string[] }
  | { type: 'trust:rejected'; reasons: string[] }
  | { type: 'warning:emitted'; warningType: SecurityWarningType };

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
  chainId?: number;
  address?: Address;
  source: DecodeSource;
  /**
   * Unix time in seconds from `DecodeOptions.now`.
   * Policies fall back to `Date.now` only when this is omitted.
   */
  now?: number;
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
  /** Decision chain for this operation. Always set, including on a hit. */
  diagnostics: DecodeDiagnostic[];
  /** Nested Multicall3 / Safe CALL / UserOp inner targets. */
  children?: DecodedOperation[];
  metadata: {
    owner?: string;
    contractName?: string;
    protocolUrl?: string;
    chainId?: number;
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
    cacheObserver?: RegistryCacheObserver;
  }): Promise<ResolvedDescriptor | null>;
  findEip712?(key: {
    chainId: number;
    address: Address;
    signature?: string;
    encodeTypeHash?: Hex;
    /** Full typed data for domain / domainSeparator matching on overrides. */
    typedData?: TypedDataInput;
    provider?: Provider | null;
    fromBlock?: bigint | LogBlockTag;
    toBlock?: bigint | LogBlockTag;
    cacheObserver?: RegistryCacheObserver;
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
   * ERC-20, ERC-721, and WETH builtins after registry and `trustedTokens`.
   * WETH matches only its deployments. Default true.
   * `officialOnlyPolicy()` rejects this source, so confidence stays `"low"`.
   * `officialOrLocalPolicy()` accepts it at `"medium"`. Never `"high"`.
   */
  builtins?: boolean;
  /**
   * Wallet-supplied policy. When omitted, decode uses `officialOnlyPolicy()`:
   * official-registry and attested are accepted; local overrides, Sourcify,
   * generated, inferred, and basic are rejected. Pass `officialOrLocalPolicy()`
   * to accept app `extend()` overrides.
   */
  trust?: TrustPolicy;
  /**
   * Wallet-known spenders / operators. Suppresses `untrusted_spender` when the
   * approve / permit / setApprovalForAll target is on this list (case-insensitive).
   */
  spenderAllowlist?: Address[];
  /**
   * Selector → Solidity declaration for this call only.
   * Overrides `COMMON_SIGNATURES` on a match. There is no process-wide signature map.
   */
  signatures?: Record<string, string>;
  /**
   * Opt-in Sourcify ABI fallback. Default false: decode does not touch the network.
   * Also requires `loadVerifiedAbi` on this call. Never `confidence: "high"`.
   */
  useSourcifyFallback?: boolean;
  /**
   * Verified-ABI loader used when `useSourcifyFallback` is true.
   * Pass `sourcifyVerifiedAbiLoader`. There is no process-wide loader.
   */
  loadVerifiedAbi?: (chainId: number, address: Address) => Promise<VerifiedContractAbi | null>;
  /** @internal Recursion guard for nested `calldata` fields. */
  calldataDepth?: number;
  /** @internal Recursion guard for Multicall3 / Safe / UserOp children. */
  nestedDepth?: number;
  /**
   * BCP-47 locale for dates / amounts only. Descriptor `intent` strings are
   * never translated — string form, else `en`, else the first string value.
   * @default "en"
   */
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
  /**
   * Observability hook. Nested decodes emit their own events with the same callback.
   * Does not open a network connection.
   */
  onEvent?: (event: ClearSignEvent) => void;
  /** @internal Per-call diagnostic buffer. Public decode functions own this. */
  diagnosticLog?: DiagnosticLog;
  /** @internal Forwarded into official-registry file loads for this call. */
  cacheObserver?: RegistryCacheObserver;
}

export type { TransactionInput, TypedDataInput };
