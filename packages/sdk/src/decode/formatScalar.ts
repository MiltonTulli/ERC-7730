import { tryResolvePath } from '../path/resolve';
import type { PathContext } from '../path/types';
import type { ResolvedDescriptor } from '../types/descriptor';
import type { ERC7730V2Metadata } from '../types/v2';
import { asRecord, formatRaw, toBigInt } from '../util';
import type { FormatOptions } from './format';
import type { TransactionInput } from './types';

export function metadataOf(descriptor: PathContext['descriptor']): ERC7730V2Metadata | undefined {
  if (!descriptor || typeof descriptor !== 'object') {
    return undefined;
  }
  const merged = 'merged' in descriptor ? (descriptor as ResolvedDescriptor).merged : descriptor;
  const meta = asRecord(merged)?.metadata;
  return asRecord(meta) as ERC7730V2Metadata | undefined;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatDuration(value: unknown): string {
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

export function formatUnixDate(seconds: bigint | number, locale: string): string {
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

export async function formatDate(
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

export function formatEnum(value: unknown, map: unknown): string {
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
    if (Object.hasOwn(record, key)) {
      return String(record[key]);
    }
  }
  return formatRaw(value);
}

export function isNativeTokenAddress(address: string, natives: unknown): boolean {
  const want = address.toLowerCase();
  if (Array.isArray(natives)) {
    return natives.some((item) => typeof item === 'string' && item.toLowerCase() === want);
  }
  if (typeof natives === 'string') {
    return natives.toLowerCase() === want;
  }
  return want === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
}

export function tokenFromMetadata(
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

export function resolveParamPath(raw: unknown, ctx: PathContext): unknown {
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
    const resolved = tryResolvePath(raw, ctx);
    return resolved === undefined ? raw : resolved;
  }
  return raw;
}
