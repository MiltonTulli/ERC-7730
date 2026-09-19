import type { OfficialRegistry } from '../official-registry/types.js';
import type { Hex, ResolvedDescriptor } from '../types/descriptor.js';
import type { Provider, TransactionInput, TypedDataInput } from '../types/index.js';

export type Address = `0x${string}`;

export type Confidence = 'high' | 'medium' | 'low';

export type DecodeSource =
  | 'official-registry'
  | 'attested'
  | 'local-override'
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
}

export interface SecurityWarning {
  type:
    | 'infinite_approval'
    | 'dangerous_permissions'
    | 'untrusted_descriptor'
    | 'untrusted_spender'
    | 'ownership_change'
    | 'proxy_upgrade'
    | 'expired_deadline'
    | 'selector_mismatch'
    | 'missing_metadata';
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
  }): Promise<ResolvedDescriptor | null>;
  findEip712?(key: {
    chainId: number;
    address: Address;
    signature?: string;
    encodeTypeHash?: Hex;
    provider?: Provider | null;
  }): Promise<ResolvedDescriptor | null>;
}

export interface DecodeOptions {
  provider?: Provider | null;
  registry?: DecodeRegistry | OfficialRegistry;
  /**
   * Reserved for #11. When omitted, decode uses a stub
   * (`policy: "unspecified"`). Sourcify / inferred / basic are never accepted.
   */
  trust?: TrustPolicy;
  /** @default true */
  useSourcifyFallback?: boolean;
  /** BCP-47 locale for dates / amounts. @default "en" */
  locale?: string;
  /**
   * Unix time in seconds for `expired_deadline`. Tests inject a frozen clock.
   * @default `Math.floor(Date.now() / 1000)`
   */
  now?: number | (() => number);
}

export type { TransactionInput, TypedDataInput };
