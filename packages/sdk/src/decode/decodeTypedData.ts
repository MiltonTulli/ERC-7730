import type { Hex, ResolvedDescriptor } from '../types/descriptor.js';
import type { TransactionInput, TypedDataInput } from '../types/index.js';
import {
  appendUntrustedWarning,
  asAddress,
  asRecord,
  confidenceFor,
  intentFromFormat,
  readMetadata,
  resolveTrust,
  sourceFromResolved,
} from './common.js';
import { matchContext } from './context.js';
import { type FormatOptions, flattenFields, formatDisplayField } from './format.js';
import { matchEip712Format } from './match.js';
import type { PathContext } from './path.js';
import { encodeType, hashEncodeType, normalizeTypedDataMessage } from './typedData.js';
import type {
  Address,
  DecodeOptions,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
} from './types.js';
import { finalizeDecodedWarnings } from './warnings.js';

function chainIdOf(data: TypedDataInput): number | undefined {
  const raw = data.chainId ?? data.domain.chainId;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'bigint') {
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : undefined;
  }
  if (typeof raw === 'number' && Number.isSafeInteger(raw)) {
    return raw;
  }
  return undefined;
}

function verifyingContractOf(data: TypedDataInput): Address | undefined {
  const value = data.domain.verifyingContract;
  if (typeof value !== 'string' || !value.startsWith('0x') || value.length !== 42) {
    return undefined;
  }
  return asAddress(value);
}

async function lookupEip712(
  data: TypedDataInput,
  options: DecodeOptions | undefined,
  chainId: number | undefined,
  address: Address | undefined,
  encodeTypeHash: Hex
): Promise<ResolvedDescriptor | null> {
  const registry = options?.registry;
  if (!registry || chainId === undefined || !address) {
    return null;
  }
  const find = registry.findEip712;
  if (typeof find !== 'function') {
    return null;
  }
  return find.call(registry, {
    chainId,
    address,
    signature: data.primaryType,
    encodeTypeHash,
    provider: options?.provider,
    fromBlock: options?.fromBlock,
    toBlock: options?.toBlock,
  });
}

function envelopeFrom(
  data: TypedDataInput,
  message: Record<string, unknown>,
  chainId: number,
  address: Address
): TransactionInput {
  const from = typeof message.owner === 'string' ? message.owner : data.domain.verifyingContract;
  return {
    to: address,
    data: '0x',
    chainId,
    from,
    value: 0n,
  };
}

async function renderFromDescriptor(
  data: TypedDataInput,
  message: Record<string, unknown>,
  resolved: ResolvedDescriptor,
  source: DecodeSource,
  encoded: string,
  chainId: number,
  address: Address,
  options: DecodeOptions | undefined
): Promise<DecodedOperation | null> {
  const matched = matchEip712Format(resolved.merged, data.primaryType, encoded);
  if (!matched) {
    return null;
  }

  const tx = envelopeFrom(data, message, chainId, address);
  const ctx: PathContext = {
    message,
    descriptor: resolved,
    envelope: {
      to: address,
      from: tx.from,
      value: 0n,
      chainId,
    },
  };
  const formatOptions: FormatOptions = {
    provider: options?.provider ?? null,
    locale: options?.locale ?? 'en',
  };

  const excluded = matched.format.excluded ?? [];
  const excludedSet = new Set(excluded);
  const required = new Set(matched.format.required ?? []);
  const fields: DecodedField[] = [];
  const warnings: SecurityWarning[] = [];

  for (const fieldDef of flattenFields(matched.format.fields)) {
    const path = fieldDef.path ?? '';
    if (path && excludedSet.has(path)) {
      continue;
    }
    const formatted = await formatDisplayField(fieldDef, ctx, tx, formatOptions, required);
    if (!formatted) {
      continue;
    }
    fields.push(formatted.field);
    warnings.push(...formatted.warnings);
  }

  const trust = await resolveTrust(options, source, resolved, chainId, address);
  appendUntrustedWarning(warnings, trust, source);
  const meta = readMetadata(resolved.merged);
  const fallbackIntent = `Sign ${data.primaryType}`;

  return {
    confidence: confidenceFor(source, trust.accepted),
    source,
    intent: intentFromFormat(
      matched.format.intent,
      matched.format.interpolatedIntent,
      fields,
      options?.locale ?? 'en'
    ).replace(/^Contract interaction$/, fallbackIntent),
    functionName: data.primaryType,
    signature: matched.key,
    fields,
    excluded,
    warnings,
    trust,
    metadata: {
      ...meta,
      chainId,
      contractAddress: address,
    },
    raw: {
      message,
    },
  };
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
  if (typeof value === 'string' || typeof value === 'number') {
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

async function fallbackOperation(
  data: TypedDataInput,
  message: Record<string, unknown>,
  encoded: string,
  chainId: number,
  address: Address | undefined,
  options: DecodeOptions | undefined
): Promise<DecodedOperation> {
  const source: DecodeSource = 'inferred';
  const fields: DecodedField[] = [];
  const typeFields = data.types[data.primaryType] ?? [];
  const warnings: SecurityWarning[] = [];

  if (typeFields.length > 0) {
    for (const field of typeFields) {
      const rawValue = message[field.name];
      const decoded: DecodedField = {
        path: field.name,
        label: field.name.charAt(0).toUpperCase() + field.name.slice(1),
        format: field.type === 'address' ? 'addressName' : 'raw',
        value: formatRaw(rawValue),
        rawValue,
        required: false,
      };
      fields.push(decoded);
    }
  } else {
    for (const [name, rawValue] of Object.entries(message)) {
      fields.push({
        path: name,
        label: name,
        format: 'raw',
        value: formatRaw(rawValue),
        rawValue,
        required: false,
      });
    }
  }

  const trust = await resolveTrust(options, source, undefined, chainId, address);
  appendUntrustedWarning(warnings, trust, source);
  return {
    confidence: confidenceFor(source, trust.accepted),
    source,
    intent: `Sign ${data.primaryType}`,
    functionName: data.primaryType,
    signature: encoded === data.primaryType ? data.primaryType : encoded,
    fields,
    excluded: [],
    warnings,
    trust,
    metadata: {
      chainId,
      contractAddress: address,
    },
    raw: {
      message,
    },
  };
}

/**
 * Decode an EIP-712 payload using an official (or override) descriptor from
 * `index.eip712.json`. Lookup is CAIP-10 `eip155:{chainId}:{verifyingContract}`
 * plus `primaryType` / keccak256(`encodeType`). Without a match, falls back to
 * inferred fields from the payload types — never `confidence: "high"`.
 */
export async function decodeTypedData(
  data: TypedDataInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  const chainId = chainIdOf(data) ?? 0;
  const address = verifyingContractOf(data);
  const encoded = encodeType(data.primaryType, data.types);
  const encodeTypeHash = hashEncodeType(data.primaryType, data.types);
  const message = asRecord(data.message)
    ? normalizeTypedDataMessage(data.message, data.types, data.primaryType)
    : {};

  const found = await lookupEip712(data, options, chainIdOf(data), address, encodeTypeHash);
  if (found && address) {
    const bound = await matchContext(found, data, {
      provider: options?.provider,
      fromBlock: options?.fromBlock,
      toBlock: options?.toBlock,
    });
    if (bound.matched) {
      const rendered = await renderFromDescriptor(
        data,
        message,
        found,
        sourceFromResolved(found),
        encoded,
        chainId,
        address,
        options
      );
      if (rendered) {
        return finalizeDecodedWarnings(rendered, options);
      }
    }
  }

  return finalizeDecodedWarnings(
    await fallbackOperation(data, message, encoded, chainId, address, options),
    options
  );
}
