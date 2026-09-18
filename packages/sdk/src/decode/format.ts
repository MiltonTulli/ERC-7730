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
import type { DecodedField, FieldFormat, SecurityWarning, TransactionInput } from './types.js';

export interface FormatOptions {
  provider?: Provider | null;
  locale?: string;
}

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

function formatDate(value: unknown, encoding: string | undefined, locale: string): string {
  const n = toBigInt(value);
  if (n === undefined) {
    return formatRaw(value);
  }
  if (encoding === 'blockheight') {
    return `block ${n.toString()}`;
  }
  const millis = Number(n) * 1000;
  if (!Number.isFinite(millis)) {
    return n.toString();
  }
  try {
    return new Date(millis).toLocaleString(locale, { timeZone: 'UTC' });
  } catch {
    return new Date(millis).toISOString();
  }
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
): Promise<{ value: string; infinite: boolean }> {
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
    return { value: formatAmount(amount, 0), infinite: false };
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

  if (tokenAddress) {
    const chainRaw =
      params?.chainIdPath !== undefined
        ? resolvePath(String(params.chainIdPath), ctx)
        : resolveParamPath(params?.chainId, ctx);
    const chainId = toBigInt(chainRaw);
    const lookupChain = chainId !== undefined ? Number(chainId) : tx.chainId;
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
  const resolved = await resolveAddress(rawValue, tx.chainId, options.provider);
  return formatAddress(resolved.address, resolved.name);
}

function formatNftName(
  rawValue: unknown,
  params: Record<string, unknown> | undefined,
  ctx: PathContext
): string {
  const id = formatRaw(rawValue);
  let collection: unknown;
  if (typeof params?.collectionPath === 'string') {
    collection = resolvePath(params.collectionPath, ctx);
  } else if (params?.collection !== undefined) {
    collection = resolveParamPath(params.collection, ctx);
  }
  if (typeof collection === 'string' && collection) {
    const short =
      collection.startsWith('0x') && collection.length === 42
        ? formatAddress(collection)
        : collection;
    return `${short} #${id}`;
  }
  return `#${id}`;
}

function formatNativeAmount(rawValue: unknown, tx: TransactionInput): string {
  const amount = toBigInt(rawValue);
  if (amount === undefined) {
    return formatRaw(rawValue);
  }
  const native = NATIVE_CURRENCY[tx.chainId] ?? { symbol: 'ETH', decimals: 18 };
  return formatAmount(amount, native.decimals, native.symbol);
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
      break;
    }
    case 'amount':
      value = formatNativeAmount(rawValue, tx);
      break;
    case 'date':
      value = formatDate(
        rawValue,
        typeof params?.encoding === 'string' ? params.encoding : 'timestamp',
        options.locale ?? 'en'
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
      value = formatNftName(rawValue, params, ctx);
      break;
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
    },
    warnings,
  };
}
