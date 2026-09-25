import { formatAddress, resolveAddress } from '../formats/addressName.js';
import {
  NATIVE_CURRENCY,
  formatAmount,
  getTokenInfo,
  isInfiniteApproval,
} from '../formats/tokenAmount.js';
import { isPlainObject } from '../resolve/util.js';
import type { ResolvedDescriptor } from '../types/descriptor.js';
import type { Provider } from '../types/index.js';
import type { DisplayField, DisplayFieldItem, ERC7730V2Metadata } from '../types/v2.js';
import type { PathContext } from './path.js';
import { resolvePath } from './path.js';
import type {
  DecodedField,
  DecodedOperation,
  ExternalDataProvider,
  FieldFormat,
  SecurityWarning,
  TransactionInput,
} from './types.js';

export interface FormatOptions {
  provider?: Provider | null;
  locale?: string;
  externalDataProvider?: ExternalDataProvider;
  /** Nested `calldata` decode. Set by the outer decoder. */
  onCalldata?: (tx: TransactionInput) => Promise<DecodedOperation>;
  calldataDepth?: number;
}

const MAX_CALLDATA_DEPTH = 2;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

function metadataOf(descriptor: PathContext['descriptor']): ERC7730V2Metadata | undefined {
  if (!descriptor || typeof descriptor !== 'object') {
    return undefined;
  }
  const merged = 'merged' in descriptor ? (descriptor as ResolvedDescriptor).merged : descriptor;
  const meta = asRecord(merged)?.metadata;
  return asRecord(meta) as ERC7730V2Metadata | undefined;
}

function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'boolean') {
    return value ? 1n : 0n;
  }
  if (typeof value === 'string' && value !== '') {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDuration(value: unknown): string {
  const seconds = toBigInt(value);
  if (seconds === undefined) {
    return formatRaw(value);
  }
  const total = seconds < 0n ? -seconds : seconds;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    return `${seconds.toString()}s`;
  }
  const n = Number(total);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const formatted = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return seconds < 0n ? `-${formatted}` : formatted;
}

function formatUnixDate(seconds: bigint | number, locale: string): string {
  const n = typeof seconds === 'bigint' ? Number(seconds) : seconds;
  const millis = n * 1000;
  if (!Number.isFinite(millis)) {
    return String(seconds);
  }
  try {
    return new Date(millis).toLocaleString(locale, { timeZone: 'UTC' });
  } catch {
    return new Date(millis).toISOString();
  }
}

async function formatDate(
  value: unknown,
  encoding: string | undefined,
  locale: string,
  tx: TransactionInput,
  options: FormatOptions
): Promise<string> {
  const n = toBigInt(value);
  if (n === undefined) {
    return formatRaw(value);
  }
  if (encoding === 'blockheight') {
    const ts = await options.externalDataProvider?.resolveBlockTimestamp?.(tx.chainId, n);
    if (ts !== null && ts !== undefined) {
      return formatUnixDate(ts, locale);
    }
    return `block ${n.toString()}`;
  }
  return formatUnixDate(n, locale);
}

function formatRaw(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Unknown';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  try {
    return JSON.stringify(value, (_key, inner) =>
      typeof inner === 'bigint' ? inner.toString() : inner
    );
  } catch {
    return String(value);
  }
}

function formatEnum(value: unknown, map: unknown): string {
  const record = asRecord(map);
  if (!record) {
    return formatRaw(value);
  }
  const keys = [String(value)];
  const asInt = toBigInt(value);
  if (asInt !== undefined) {
    keys.push(asInt.toString(), `0x${asInt.toString(16)}`);
  }
  for (const key of keys) {
    if (key in record) {
      return String(record[key]);
    }
  }
  return formatRaw(value);
}

function isNativeTokenAddress(address: string, natives: unknown): boolean {
  const want = address.toLowerCase();
  if (Array.isArray(natives)) {
    return natives.some((item) => typeof item === 'string' && item.toLowerCase() === want);
  }
  if (typeof natives === 'string') {
    return natives.toLowerCase() === want;
  }
  return want === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
}

function tokenFromMetadata(
  tokenAddress: string | undefined,
  envelopeTo: string | undefined,
  meta: ERC7730V2Metadata | undefined
): { symbol: string; decimals: number } | null {
  if (!meta?.token) {
    return null;
  }
  if (tokenAddress && envelopeTo && tokenAddress.toLowerCase() !== envelopeTo.toLowerCase()) {
    return null;
  }
  return { symbol: meta.token.ticker, decimals: meta.token.decimals };
}

function resolveParamPath(raw: unknown, ctx: PathContext): unknown {
  if (typeof raw !== 'string') {
    return raw;
  }
  if (
    raw.startsWith('#') ||
    raw.startsWith('$') ||
    raw.startsWith('@') ||
    raw.includes('.') ||
    raw.includes('[')
  ) {
    const resolved = resolvePath(raw, ctx);
    return resolved === undefined ? raw : resolved;
  }
  return raw;
}

function normalizeFormat(format: string | undefined): FieldFormat {
  if (!format) {
    return 'raw';
  }
  if (format === 'addressOrName') {
    return 'addressName';
  }
  return format as FieldFormat;
}

function fieldVisible(field: DisplayField, rawValue: unknown): boolean {
  const visible = field.visible;
  if (visible === undefined || visible === 'always' || visible === 'optional') {
    return true;
  }
  if (visible === 'never') {
    return false;
  }
  if (isPlainObject(visible) && Array.isArray(visible.ifNotIn)) {
    const keys = new Set(visible.ifNotIn.map((item) => String(item)));
    return !keys.has(String(rawValue));
  }
  if (isPlainObject(visible) && Array.isArray(visible.mustMatch)) {
    return false;
  }
  return true;
}

export function flattenFields(items: DisplayFieldItem[] | undefined): DisplayField[] {
  if (!items) {
    return [];
  }
  const out: DisplayField[] = [];
  for (const item of items) {
    if (!isPlainObject(item)) {
      continue;
    }
    if (Array.isArray((item as { fields?: unknown }).fields)) {
      out.push(...flattenFields((item as { fields: DisplayFieldItem[] }).fields));
      continue;
    }
    out.push(item as DisplayField);
  }
  return out;
}

async function formatTokenAmount(
  rawValue: unknown,
  params: Record<string, unknown> | undefined,
  ctx: PathContext,
  tx: TransactionInput,
  options: FormatOptions
): Promise<{ value: string; infinite: boolean; missingMetadata?: boolean }> {
  const amount = toBigInt(rawValue);
  if (amount === undefined) {
    return { value: formatRaw(rawValue), infinite: false };
  }

  let threshold: bigint | undefined;
  if (params?.threshold !== undefined) {
    const resolved = resolveParamPath(params.threshold, ctx);
    threshold = toBigInt(resolved);
  }

  const infinite = isInfiniteApproval(amount) || (threshold !== undefined && amount >= threshold);
  const tickerHint = metadataOf(ctx.descriptor)?.token?.ticker;
  if (infinite) {
    const message = typeof params?.message === 'string' ? params.message : 'Unlimited';
    const info = await resolveTokenInfo(params, ctx, tx, options);
    const symbol = info?.symbol ?? tickerHint;
    return { value: symbol ? `${message} ${symbol}` : message, infinite: true };
  }

  const info = await resolveTokenInfo(params, ctx, tx, options);
  if (!info) {
    // Decimals are unknown: show the raw base-unit value, not a human amount.
    return { value: `${amount.toString()} (raw)`, infinite: false, missingMetadata: true };
  }
  return { value: formatAmount(amount, info.decimals, info.symbol), infinite: false };
}

async function resolveTokenInfo(
  params: Record<string, unknown> | undefined,
  ctx: PathContext,
  tx: TransactionInput,
  options: FormatOptions
): Promise<{ symbol: string; decimals: number } | null> {
  let tokenRaw: unknown;
  if (typeof params?.tokenPath === 'string') {
    tokenRaw = resolvePath(params.tokenPath, ctx);
  } else if (params?.token !== undefined) {
    tokenRaw = resolveParamPath(params.token, ctx);
  } else {
    tokenRaw = resolvePath('@.to', ctx);
  }

  const tokenAddress = typeof tokenRaw === 'string' ? tokenRaw : undefined;
  if (tokenAddress && isNativeTokenAddress(tokenAddress, params?.nativeCurrencyAddress)) {
    return NATIVE_CURRENCY[tx.chainId] ?? { symbol: 'ETH', decimals: 18 };
  }

  const fromMeta = tokenFromMetadata(tokenAddress, tx.to, metadataOf(ctx.descriptor));
  if (fromMeta) {
    return fromMeta;
  }

  const chainRaw =
    params?.chainIdPath !== undefined
      ? resolvePath(String(params.chainIdPath), ctx)
      : resolveParamPath(params?.chainId, ctx);
  const chainId = toBigInt(chainRaw);
  const lookupChain = chainId !== undefined ? Number(chainId) : tx.chainId;
  const lookupAddress = tokenAddress ?? tx.to;

  if (options.externalDataProvider?.resolveToken && ADDRESS_RE.test(lookupAddress)) {
    const info = await options.externalDataProvider.resolveToken(
      lookupChain,
      lookupAddress as `0x${string}`
    );
    if (info) {
      return { symbol: info.symbol, decimals: info.decimals };
    }
    // Provider was asked and returned null: do not fall through to RPC catalogs.
    return null;
  }

  if (tokenAddress) {
    return getTokenInfo(tokenAddress, lookupChain, options.provider);
  }

  return getTokenInfo(tx.to, tx.chainId, options.provider);
}

async function formatAddressName(
  rawValue: unknown,
  tx: TransactionInput,
  options: FormatOptions
): Promise<string> {
  if (!rawValue || typeof rawValue !== 'string') {
    return formatRaw(rawValue);
  }
  const address = rawValue as `0x${string}`;
  const edp = options.externalDataProvider;
  if (edp?.resolveEnsName || edp?.resolveLocalName) {
    const ens = edp.resolveEnsName ? await edp.resolveEnsName(address) : null;
    if (ens) {
      return formatAddress(address, ens);
    }
    const local = edp.resolveLocalName ? await edp.resolveLocalName(address) : null;
    if (local) {
      return formatAddress(address, local);
    }
    return formatAddress(address);
  }
  const resolved = await resolveAddress(rawValue, tx.chainId, options.provider);
  return formatAddress(resolved.address, resolved.name);
}

async function formatNftName(
  rawValue: unknown,
  params: Record<string, unknown> | undefined,
  ctx: PathContext,
  tx: TransactionInput,
  options: FormatOptions
): Promise<string> {
  const id = formatRaw(rawValue);
  let collection: unknown;
  if (typeof params?.collectionPath === 'string') {
    collection = resolvePath(params.collectionPath, ctx);
  } else if (params?.collection !== undefined) {
    collection = resolveParamPath(params.collection, ctx);
  }
  if (typeof collection === 'string' && collection) {
    if (ADDRESS_RE.test(collection) && options.externalDataProvider?.resolveNftCollectionName) {
      const name = await options.externalDataProvider.resolveNftCollectionName(
        tx.chainId,
        collection as `0x${string}`
      );
      if (name) {
        return `${name} #${id}`;
      }
    }
    const short =
      collection.startsWith('0x') && collection.length === 42
        ? formatAddress(collection)
        : collection;
    return `${short} #${id}`;
  }
  return `#${id}`;
}

async function formatNativeAmount(
  rawValue: unknown,
  tx: TransactionInput,
  options: FormatOptions
): Promise<string> {
  const amount = toBigInt(rawValue);
  if (amount === undefined) {
    return formatRaw(rawValue);
  }
  if (options.externalDataProvider?.resolveChainInfo) {
    const info = await options.externalDataProvider.resolveChainInfo(tx.chainId);
    if (info) {
      return formatAmount(amount, info.decimals ?? 18, info.symbol);
    }
  }
  const native = NATIVE_CURRENCY[tx.chainId] ?? { symbol: 'ETH', decimals: 18 };
  return formatAmount(amount, native.decimals, native.symbol);
}

async function formatCalldataField(
  rawValue: unknown,
  params: Record<string, unknown> | undefined,
  ctx: PathContext,
  tx: TransactionInput,
  options: FormatOptions
): Promise<{ value: string; embedded?: DecodedOperation }> {
  const hex = typeof rawValue === 'string' && HEX_RE.test(rawValue) ? rawValue : undefined;
  if (!hex) {
    return { value: formatRaw(rawValue) };
  }

  let callee: unknown;
  if (typeof params?.calleePath === 'string') {
    callee = resolvePath(params.calleePath, ctx);
  } else if (params?.callee !== undefined) {
    callee = resolveParamPath(params.callee, ctx);
  }
  if (typeof callee !== 'string' || !ADDRESS_RE.test(callee)) {
    return { value: hex.length > 66 ? `${hex.slice(0, 10)}…${hex.slice(-8)}` : hex };
  }

  let data = hex;
  let selector: unknown;
  if (typeof params?.selectorPath === 'string') {
    selector = resolvePath(params.selectorPath, ctx);
  } else if (params?.selector !== undefined) {
    selector = resolveParamPath(params.selector, ctx);
  }
  if (typeof selector === 'string' && /^0x[0-9a-fA-F]{8}$/.test(selector)) {
    if (!data.startsWith(selector.toLowerCase()) && data.length === 2) {
      data = selector;
    } else if (data === '0x' || data.length < 10) {
      data = `${selector}${data.slice(2)}`;
    }
  }

  let valueWei: bigint | undefined;
  if (typeof params?.amountPath === 'string') {
    valueWei = toBigInt(resolvePath(params.amountPath, ctx));
  } else if (params?.amount !== undefined) {
    valueWei = toBigInt(resolveParamPath(params.amount, ctx));
  }

  const depth = options.calldataDepth ?? 0;
  if (depth >= MAX_CALLDATA_DEPTH || !options.onCalldata) {
    return { value: hex.length > 66 ? `${hex.slice(0, 10)}…${hex.slice(-8)}` : hex };
  }

  const embedded = await options.onCalldata({
    to: callee,
    data: data as `0x${string}`,
    chainId: tx.chainId,
    from: tx.from,
    value: valueWei,
  });
  return {
    value: embedded.interpolatedIntent ?? embedded.intent,
    embedded,
  };
}

export interface FormattedFieldResult {
  field: DecodedField;
  warnings: SecurityWarning[];
}

export async function formatDisplayField(
  fieldDef: DisplayField,
  ctx: PathContext,
  tx: TransactionInput,
  options: FormatOptions,
  requiredPaths: Set<string>
): Promise<FormattedFieldResult | null> {
  const rawValue =
    fieldDef.value !== undefined
      ? fieldDef.value
      : fieldDef.path
        ? resolvePath(fieldDef.path, ctx)
        : undefined;

  if (!fieldVisible(fieldDef, rawValue)) {
    return null;
  }

  const format = normalizeFormat(fieldDef.format);
  const params = asRecord(fieldDef.params);
  const path = fieldDef.path ?? '';
  const label = fieldDef.label ?? path ?? 'Field';
  let value: string;
  const warnings: SecurityWarning[] = [];

  let embedded: DecodedOperation | undefined;

  switch (format) {
    case 'tokenAmount': {
      const formatted = await formatTokenAmount(rawValue, params, ctx, tx, options);
      value = formatted.value;
      if (formatted.infinite) {
        warnings.push({
          type: 'infinite_approval',
          severity: 'high',
          message: 'This approval grants unlimited spending access to your tokens',
          path,
        });
      }
      if (formatted.missingMetadata) {
        warnings.push({
          type: 'missing_metadata',
          severity: 'medium',
          message: 'Token decimals are unknown; amount is shown in raw base units',
          path,
        });
      }
      break;
    }
    case 'amount':
      value = await formatNativeAmount(rawValue, tx, options);
      break;
    case 'date':
      value = await formatDate(
        rawValue,
        typeof params?.encoding === 'string' ? params.encoding : 'timestamp',
        options.locale ?? 'en',
        tx,
        options
      );
      break;
    case 'duration':
      value = formatDuration(rawValue);
      break;
    case 'addressName':
    case 'addressOrName':
    case 'interoperableAddressName':
      value = await formatAddressName(rawValue, tx, options);
      break;
    case 'enum': {
      const ref = typeof params?.$ref === 'string' ? params.$ref : undefined;
      value = formatEnum(rawValue, ref ? resolvePath(ref, ctx) : undefined);
      break;
    }
    case 'nftName':
      value = await formatNftName(rawValue, params, ctx, tx, options);
      break;
    case 'calldata': {
      const nested = await formatCalldataField(rawValue, params, ctx, tx, options);
      value = nested.value;
      embedded = nested.embedded;
      break;
    }
    case 'chainId': {
      const chain = toBigInt(rawValue);
      if (chain === undefined) {
        value = formatRaw(rawValue);
        break;
      }
      const info = await options.externalDataProvider?.resolveChainInfo?.(Number(chain));
      value = info?.name ?? chain.toString();
      break;
    }
    case 'unit': {
      const decimals = typeof params?.decimals === 'number' ? params.decimals : 0;
      const amount = toBigInt(rawValue);
      const base = typeof params?.base === 'string' ? params.base : '';
      if (amount === undefined) {
        value = formatRaw(rawValue);
      } else {
        value = `${formatAmount(amount, decimals)}${base ? ` ${base}` : ''}`;
      }
      break;
    }
    default:
      value = formatRaw(rawValue);
      break;
  }

  const required =
    requiredPaths.size === 0
      ? true
      : requiredPaths.has(path) ||
        [...requiredPaths].some((item) => item === path || path.endsWith(item));

  return {
    field: {
      path,
      label,
      format,
      value,
      rawValue,
      required,
      params,
      embedded,
    },
    warnings,
  };
}
