import type { OfficialRegistry } from '../official-registry/types';
import type { TrustReasonCode } from '../trust/reasons';
import type { LogBlockTag, Provider, TransactionInput, TypedDataInput } from '../types';
import type { Hex, InputDescriptor, ResolvedDescriptor } from '../types/descriptor';

export type Address = `0x${string}`;

/** How strongly the wallet may present this decode. Official-only never yields `high` for a fallback. */
export type Confidence = 'high' | 'medium' | 'low';

/** Where the descriptor or the fallback came from. */
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

/** Parsed `tokenAmount` field. `amount` is the raw integer, not the display string. */
export interface TokenAmountDetails {
  amount: bigint;
  token?: TokenInfo;
  /** True when the amount is at or above the unlimited-approval threshold. */
  isInfinite: boolean;
  nativeCurrency?: boolean;
}

/** Parsed `addressName` field. */
export interface AddressNameDetails {
  address: Address;
  name?: string;
  /** `descriptor` is a static label. `provider` came from ENS or a local name. */
  nameSource?: 'descriptor' | 'provider' | 'none';
  types?: string[];
}

/** Parsed `date` field. `timestamp` is unix seconds. */
export interface DateDetails {
  timestamp: number;
  encoding: 'timestamp' | 'blockheight';
}

/** Parsed `enum` field. `resolved` is the name from the descriptor when it matched. */
export interface EnumDetails {
  raw: string;
  resolved?: string;
}

/** Parsed `nftName` field. */
export interface NftNameDetails {
  collection: Address;
  tokenId: bigint;
}

/** Parsed `calldata` field. `embedded` is an inner {@link DecodedOperation}, not batch `children`. */
export interface CalldataDetails {
  /** Inner `decodeTransaction`. Not Multicall3 / batch `children`. */
  embedded: DecodedOperation;
}

/** Parsed field that has no structured details. `raw` is the ABI or message value. */
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

/** One displayed field. `format` selects which `details` shape is present. */
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

/** One step in the decision chain. Present on a hit and on a miss. */
export interface DecodeDiagnostic {
  stage: DecodeDiagnosticStage;
  outcome: DecodeDiagnosticOutcome;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Buffer of {@link DecodeDiagnostic} entries for one call. Decode owns it. */
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

/**
 * Observability events from one decode.
 * Nested decodes emit their own events on the same `onEvent` callback.
 */
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
  | { type: 'trust:accepted'; reasons: TrustReasonCode[] }
  | { type: 'trust:rejected'; reasons: TrustReasonCode[] }
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
  'no_trusted_attestation',
] as const;

/** One of {@link SECURITY_WARNING_TYPES}. */
export type SecurityWarningType = (typeof SECURITY_WARNING_TYPES)[number];

/** A risk the wallet should show next to the decoded call. */
export interface SecurityWarning {
  type: SecurityWarningType;
  severity: 'high' | 'medium' | 'low';
  message: string;
  /** Field path the warning refers to, when it is about one field. */
  path?: string;
}

/** Result of one {@link TrustPolicy}. `accepted` is the only accept bit. */
export interface TrustReport {
  accepted: boolean;
  /** Policy id, for example `official-only` or `attested`. */
  policy: string;
  descriptorHash?: Hex;
  /** Attester that signed the matching ERC-8176 attestation, when accepted that way. */
  attesters?: Address[];
  reasons: TrustReasonCode[];
}

/** Input to {@link TrustPolicy.evaluate}. */
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

/** Wallet-supplied accept/reject rule. Decode uses `officialOnlyPolicy()` when omitted. */
export interface TrustPolicy {
  readonly id: string;
  evaluate(ctx: TrustContext): Promise<TrustReport> | TrustReport;
}

/**
 * One decoded call. This is the source of truth for screens, trust, and warnings.
 * Nested Multicall3 / Safe CALL / UserOp targets are `children`, not `fields`.
 */
export interface DecodedOperation {
  confidence: Confidence;
  source: DecodeSource;
  /** Descriptor intent, or a fallback label. Not the interpolated sentence. */
  intent: string;
  /**
   * Sentence with field values filled in. Omitted when the descriptor has no
   * template or a `{path}` placeholder cannot be resolved.
   */
  interpolatedIntent?: string;
  functionName?: string;
  /** Solidity declaration, for example `deposit()`. */
  signature?: string;
  selector?: Hex;
  fields: DecodedField[];
  /** Paths the descriptor told the wallet not to show. */
  excluded: string[];
  warnings: SecurityWarning[];
  trust: TrustReport;
  /** Decision chain for this operation. Always set, including on a hit. */
  diagnostics: DecodeDiagnostic[];
  /** Nested Multicall3 / Safe CALL / UserOp inner targets. */
  children?: DecodedOperation[];
  /** Labels copied from the descriptor metadata. Not a second decode. */
  metadata: {
    owner?: string;
    contractName?: string;
    protocolUrl?: string;
    chainId?: number;
    contractAddress?: Address;
    descriptorId?: string;
    registryPath?: string;
  };
  /** Values the decoder read before formatting. */
  raw: {
    selector?: Hex;
    args?: readonly unknown[];
    message?: Record<string, unknown>;
  };
}

/**
 * Descriptor lookup used by decode. {@link OfficialRegistry} satisfies this.
 * The official index path does not run {@link matchContext}; override lookups do.
 */
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
    diagnosticLog?: DiagnosticLog;
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
    diagnosticLog?: DiagnosticLog;
  }): Promise<ResolvedDescriptor | null>;
}

/** Template family for {@link TrustedTokens}. Never `confidence: "high"` under official-only. */
export type TrustedTokenStandard = 'erc20' | 'erc721';

/** chainId → address → standard. Addresses are matched case-insensitively. */
export type TrustedTokens = Record<number, Record<string, TrustedTokenStandard>>;

/** Token metadata a wallet provider returns. The SDK does not call the chain for this. */
export interface TokenInfo {
  symbol: string;
  decimals: number;
  name?: string;
}

/** Native currency metadata for a chain id. */
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
}

/** ABI returned by an optional verified-source adapter. */
export interface VerifiedContractAbi {
  abi: readonly unknown[];
  name?: string;
  /**
   * Draft descriptor authored by the loader.
   * The decode core does not build one from the ABI.
   */
  descriptor?: InputDescriptor;
}

/**
 * Per-call decode settings. Omitted `trust` means {@link officialOnlyPolicy}.
 * Omitted `registry` is whatever the caller passed; `clearSign` fills the pinned registry.
 */
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
   * Import it from `@erc7730/sdk/sourcify` and call the factory.
   * There is no process-wide loader. The root entry does not include the client.
   */
  loadVerifiedAbi?: (chainId: number, address: Address) => Promise<VerifiedContractAbi | null>;
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
   * Factory `getLogs` range forwarded to `matchContext`. Factory matching is
   * skipped (`FACTORY_RANGE_UNBOUNDED`) unless `fromBlock` is a block number or
   * a tag other than `earliest`. An unset `toBlock` becomes `latest`.
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

/** Decodes a nested transaction. Injected so render helpers do not import the decoder. */
export type DecodeRun = (
  tx: TransactionInput,
  options?: DecodeOptions & DecodeRunState
) => Promise<DecodedOperation>;

/** Recursion state. Not part of public {@link DecodeOptions}. */
export interface DecodeRunState {
  calldataDepth?: number;
  nestedDepth?: number;
  decodeRun?: DecodeRun;
}

export type { TransactionInput, TypedDataInput };
