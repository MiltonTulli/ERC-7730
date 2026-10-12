import { formatAmount } from '../formats/tokenAmount';
import { tryResolvePath } from '../path/resolve';
import type { PathContext } from '../path/types';
import { isPlainObject } from '../resolve/util';
import type { Provider } from '../types';
import type { DisplayField, DisplayFieldItem } from '../types/v2';
import { ADDRESS_RE, asRecord, formatRaw, toBigInt } from '../util';
import {
  formatAddressName,
  formatCalldataField,
  formatNativeAmount,
  formatNftName,
  formatTokenAmount,
} from './formatRender';
import { formatDate, formatDuration, formatEnum, resolveParamPath } from './formatScalar';
import type {
  DecodedField,
  DecodedOperation,
  ExternalDataProvider,
  FieldFormat,
  SecurityWarning,
  TransactionInput,
} from './types';

export interface FormatOptions {
  provider?: Provider | null;
  locale?: string;
  externalDataProvider?: ExternalDataProvider;
  /** Nested `calldata` decode. Set by the outer decoder. */
  onCalldata?: (tx: TransactionInput) => Promise<DecodedOperation>;
  calldataDepth?: number;
}

function normalizeFormat(format: string | undefined): FieldFormat {
  if (!format || format === 'addressOrName') {
    return format === 'addressOrName' ? 'addressName' : 'raw';
  }
  return format as FieldFormat;
}

function fieldLabel(explicit: string | undefined, path: string, format: string): string {
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit;
  }
  const tail = path.split('.').pop() ?? '';
  const cleaned = tail.replace(/\[[^\]]*\]/g, '');
  if (cleaned.length > 0) {
    return cleaned;
  }
  if (path.length > 0) {
    return path;
  }
  return format;
}

function requiredFlag(path: string, requiredPaths: Set<string>): boolean | 'implicit' {
  if (requiredPaths.size === 0) {
    return 'implicit';
  }
  if (requiredPaths.has(path) || [...requiredPaths].some((item) => path.endsWith(`.${item}`))) {
    return true;
  }
  return false;
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
        ? tryResolvePath(fieldDef.path, ctx)
        : undefined;

  if (!fieldVisible(fieldDef, rawValue)) {
    return null;
  }

  const requested = normalizeFormat(fieldDef.format);
  const params = asRecord(fieldDef.params);
  const path = fieldDef.path ?? '';
  const warnings: SecurityWarning[] = [];
  const required = requiredFlag(path, requiredPaths);
  const base = {
    path,
    rawValue,
    required,
    ...(params ? { params } : {}),
  };

  const rawField = (value: string, formatName: string = requested): DecodedField => ({
    ...base,
    label: fieldLabel(fieldDef.label, path, formatName),
    format: 'raw',
    value,
    details: { raw: rawValue },
  });

  let field: DecodedField;

  switch (requested) {
    case 'tokenAmount': {
      const formatted = await formatTokenAmount(rawValue, params, ctx, tx, options);
      if (formatted.amount === undefined) {
        field = rawField(formatted.value, 'raw');
        break;
      }
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
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'tokenAmount'),
        format: 'tokenAmount',
        value: formatted.value,
        details: {
          amount: formatted.amount,
          ...(formatted.token
            ? {
                token: {
                  symbol: formatted.token.symbol,
                  decimals: formatted.token.decimals,
                  ...(formatted.token.name ? { name: formatted.token.name } : {}),
                },
              }
            : {}),
          isInfinite: formatted.infinite,
          ...(formatted.nativeCurrency ? { nativeCurrency: true } : {}),
        },
      };
      break;
    }
    case 'amount':
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'amount'),
        format: 'amount',
        value: await formatNativeAmount(rawValue, tx, options),
        details: { raw: rawValue },
      };
      break;
    case 'date': {
      const encoding = params?.encoding === 'blockheight' ? 'blockheight' : 'timestamp';
      const n = toBigInt(rawValue);
      if (n === undefined) {
        field = rawField(formatRaw(rawValue), 'raw');
        break;
      }
      const resolvedTs =
        encoding === 'blockheight'
          ? await options.externalDataProvider?.resolveBlockTimestamp?.(tx.chainId, n)
          : undefined;
      const timestamp =
        resolvedTs !== null && resolvedTs !== undefined && Number.isFinite(resolvedTs)
          ? resolvedTs
          : Number(n);
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'date'),
        format: 'date',
        value: await formatDate(rawValue, encoding, options.locale ?? 'en', tx, options),
        details: {
          timestamp: Number.isFinite(timestamp) ? timestamp : 0,
          encoding,
        },
      };
      break;
    }
    case 'duration':
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'duration'),
        format: 'duration',
        value: formatDuration(rawValue),
        details: { raw: rawValue },
      };
      break;
    case 'addressName':
    case 'addressOrName':
    case 'interoperableAddressName': {
      const named = await formatAddressName(rawValue, tx, options);
      if (!named.ok) {
        field = rawField(named.value, 'raw');
        break;
      }
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'addressName'),
        format: 'addressName',
        value: named.value,
        details: {
          address: named.address,
          ...(named.name ? { name: named.name } : {}),
          nameSource: named.nameSource,
        },
      };
      break;
    }
    case 'enum': {
      const ref = typeof params?.$ref === 'string' ? params.$ref : undefined;
      const raw = formatRaw(rawValue);
      const resolved = formatEnum(rawValue, ref ? tryResolvePath(ref, ctx) : undefined);
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'enum'),
        format: 'enum',
        value: resolved,
        details: resolved === raw ? { raw } : { raw, resolved },
      };
      break;
    }
    case 'nftName': {
      const tokenId = toBigInt(rawValue);
      let collection: unknown;
      if (typeof params?.collectionPath === 'string') {
        collection = tryResolvePath(params.collectionPath, ctx);
      } else if (params?.collection !== undefined) {
        collection = resolveParamPath(params.collection, ctx);
      }
      const collectionAddress =
        typeof collection === 'string' && ADDRESS_RE.test(collection)
          ? (collection as `0x${string}`)
          : ADDRESS_RE.test(tx.to)
            ? tx.to
            : undefined;
      if (tokenId === undefined || !collectionAddress) {
        field = rawField(await formatNftName(rawValue, params, ctx, tx, options), 'raw');
        break;
      }
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'nftName'),
        format: 'nftName',
        value: await formatNftName(rawValue, params, ctx, tx, options),
        details: { collection: collectionAddress, tokenId },
      };
      break;
    }
    case 'calldata': {
      const nested = await formatCalldataField(rawValue, params, ctx, tx, options);
      if (!nested.embedded) {
        field = rawField(nested.value, 'raw');
        break;
      }
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'calldata'),
        format: 'calldata',
        value: nested.value,
        details: { embedded: nested.embedded },
      };
      break;
    }
    case 'chainId': {
      const chain = toBigInt(rawValue);
      let value: string;
      if (chain === undefined) {
        value = formatRaw(rawValue);
      } else {
        const info = await options.externalDataProvider?.resolveChainInfo?.(Number(chain));
        value = info?.name ?? chain.toString();
      }
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'chainId'),
        format: 'chainId',
        value,
        details: { raw: rawValue },
      };
      break;
    }
    case 'unit': {
      const decimals = typeof params?.decimals === 'number' ? params.decimals : 0;
      const amount = toBigInt(rawValue);
      const unitBase = typeof params?.base === 'string' ? params.base : '';
      const value =
        amount === undefined
          ? formatRaw(rawValue)
          : `${formatAmount(amount, decimals)}${unitBase ? ` ${unitBase}` : ''}`;
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'unit'),
        format: 'unit',
        value,
        details: { raw: rawValue },
      };
      break;
    }
    case 'tokenTicker':
      field = {
        ...base,
        label: fieldLabel(fieldDef.label, path, 'tokenTicker'),
        format: 'tokenTicker',
        value: formatRaw(rawValue),
        details: { raw: rawValue },
      };
      break;
    default:
      field = rawField(formatRaw(rawValue), 'raw');
      break;
  }

  return { field, warnings };
}
