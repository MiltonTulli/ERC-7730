import { decodeCalldata, extractSelector } from '../core/decoder.js';
import { getSignatureBySelector } from '../core/signatures.js';
import { generateDescriptor } from '../generate/generate.js';
import { fetchFromSourcify } from '../providers/sourcify.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import type { Hex, InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';
import type { TransactionInput } from '../types/index.js';
import { decodeNamedArgs, parseDeclaration } from './abi.js';
import {
  ZERO_ADDRESS,
  appendUntrustedWarning,
  asAddress,
  confidenceFor,
  intentFromFormat,
  readMetadata,
  resolveTrust,
  sourceFromResolved,
} from './common.js';
import { matchContext } from './context.js';
import { type FormatOptions, flattenFields, formatDisplayField } from './format.js';
import { matchFormat } from './match.js';
import type { PathContext } from './path.js';
import type {
  DecodeOptions,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
} from './types.js';
import { finalizeDecodedWarnings, sourcifySelectorMismatch } from './warnings.js';

function asHex(value: string): Hex {
  return value as Hex;
}

function parseTxValue(value: TransactionInput['value']): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function inferIntentName(functionName: string | null): string {
  if (!functionName) {
    return 'Contract interaction';
  }
  const patterns: Record<string, string> = {
    transfer: 'Send tokens',
    approve: 'Approve spending',
    swap: 'Swap tokens',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    stake: 'Stake',
    unstake: 'Unstake',
    claim: 'Claim rewards',
    mint: 'Mint',
    burn: 'Burn',
    execute: 'Execute',
    multicall: 'Multiple calls',
  };
  const lower = functionName.toLowerCase();
  for (const [pattern, intent] of Object.entries(patterns)) {
    if (lower.includes(pattern)) {
      return intent;
    }
  }
  return functionName.charAt(0).toUpperCase() + functionName.slice(1);
}

function selectorFromTx(tx: TransactionInput): Hex | undefined {
  if (!tx.data || tx.data === '0x' || tx.data.length < 10) {
    return undefined;
  }
  try {
    return asHex(extractSelector(tx.data));
  } catch {
    return undefined;
  }
}

async function renderFromDescriptor(
  tx: TransactionInput,
  resolved: ResolvedDescriptor,
  source: DecodeSource,
  selector: Hex | undefined,
  options: DecodeOptions | undefined
): Promise<DecodedOperation | null> {
  if (!selector) {
    return null;
  }
  const matched = matchFormat(resolved.merged, selector);
  if (!matched) {
    return null;
  }

  const decoded = decodeNamedArgs(tx.data, matched.declaration);
  const envelope = {
    to: tx.to,
    from: tx.from,
    value: parseTxValue(tx.value),
    chainId: tx.chainId,
    data: tx.data,
  };
  const ctx: PathContext = {
    args: decoded.named,
    descriptor: resolved,
    envelope,
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

  const trust = await resolveTrust(options, source, resolved, tx.chainId, asAddress(tx.to));
  appendUntrustedWarning(warnings, trust, source);
  const meta = readMetadata(resolved.merged);
  const declaration = matched.declaration;

  return {
    confidence: confidenceFor(source, trust.accepted),
    source,
    intent: intentFromFormat(
      matched.format.intent,
      matched.format.interpolatedIntent,
      fields,
      options?.locale ?? 'en'
    ),
    functionName: declaration?.name,
    signature: declaration?.canonical ?? matched.key,
    selector,
    fields,
    excluded,
    warnings,
    trust,
    metadata: {
      ...meta,
      chainId: tx.chainId,
      contractAddress: asAddress(tx.to),
    },
    raw: {
      selector,
      args: decoded.positional,
    },
  };
}

async function trySourcify(
  tx: TransactionInput,
  selector: Hex | undefined,
  options: DecodeOptions | undefined
): Promise<{ operation: DecodedOperation | null; selectorMismatch: boolean }> {
  if (!tx.to || tx.to.toLowerCase() === ZERO_ADDRESS) {
    return { operation: null, selectorMismatch: false };
  }
  try {
    const result = await fetchFromSourcify(tx.chainId, tx.to);
    if (!result.verified || !result.abi) {
      return { operation: null, selectorMismatch: false };
    }
    const selectorMismatch = selector ? sourcifySelectorMismatch(result.abi, selector) : false;
    const generated = generateDescriptor({
      chainId: tx.chainId,
      address: tx.to,
      abi: result.abi,
      owner: result.name || undefined,
    });
    const resolved = await resolveDescriptor(
      generated as InputDescriptor,
      createMemoryIncludeLoader({})
    );
    const operation = await renderFromDescriptor(tx, resolved, 'sourcify', selector, options);
    return { operation, selectorMismatch };
  } catch {
    return { operation: null, selectorMismatch: false };
  }
}

function fallbackOperation(
  tx: TransactionInput,
  options: DecodeOptions | undefined
): Promise<DecodedOperation> {
  const selector = selectorFromTx(tx);
  const raw = selector ? decodeCalldata(tx) : null;
  const known = selector ? getSignatureBySelector(selector) : null;
  const source: DecodeSource = known || raw?.signature ? 'inferred' : 'basic';
  const fields: DecodedField[] = [];

  if (raw) {
    const declaration = raw.signature ? parseDeclaration(raw.signature) : null;
    for (let i = 0; i < raw.args.length; i++) {
      const type = raw.inputTypes[i] || 'unknown';
      const value = raw.args[i];
      const paramName = declaration?.params[i]?.name;
      const label = paramName ?? `Param ${i + 1}`;
      let format: DecodedField['format'] = 'raw';
      let formatted = typeof value === 'bigint' ? value.toString() : String(value ?? 'Unknown');
      if (type === 'address' && typeof value === 'string') {
        format = 'addressName';
        formatted = value;
      }
      fields.push({
        path: paramName ?? `[${i}]`,
        label,
        format,
        value: formatted,
        rawValue: value,
        required: false,
      });
    }
  }

  return resolveTrust(options, source, undefined, tx.chainId, asAddress(tx.to)).then((trust) => {
    const warnings: SecurityWarning[] = [];
    appendUntrustedWarning(warnings, trust, source);
    return {
      confidence: confidenceFor(source, trust.accepted),
      source,
      intent: inferIntentName(raw?.functionName ?? known?.name ?? null),
      functionName: raw?.functionName ?? known?.name ?? undefined,
      signature: raw?.signature ?? known?.signature ?? selector,
      selector,
      fields,
      excluded: [],
      warnings,
      trust,
      metadata: {
        chainId: tx.chainId,
        contractAddress: asAddress(tx.to),
      },
      raw: {
        selector,
        args: raw?.args,
      },
    };
  });
}

/**
 * Decode a transaction using an official (or override) descriptor's
 * `display.formats`. Without a match, falls back to Sourcify (optional) then
 * inferred / basic — never `confidence: "high"` for those sources.
 */
export async function decodeTransaction(
  tx: TransactionInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  const selector = selectorFromTx(tx);
  const useSourcify = options?.useSourcifyFallback ?? true;

  if (options?.registry && selector) {
    const found = await options.registry.findCalldata({
      chainId: tx.chainId,
      address: asAddress(tx.to),
      selector,
      provider: options.provider,
      fromBlock: options.fromBlock,
      toBlock: options.toBlock,
    });
    if (found) {
      const bound = await matchContext(found, tx, {
        provider: options.provider,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
      });
      if (bound.matched) {
        const rendered = await renderFromDescriptor(
          tx,
          found,
          sourceFromResolved(found),
          selector,
          options
        );
        if (rendered) {
          return finalizeDecodedWarnings(rendered, options);
        }
      }
    }
  }

  if (useSourcify && selector) {
    const sourcify = await trySourcify(tx, selector, options);
    if (sourcify.operation) {
      return finalizeDecodedWarnings(sourcify.operation, options, {
        selectorMismatch: sourcify.selectorMismatch,
      });
    }
    if (sourcify.selectorMismatch) {
      const fallback = await fallbackOperation(tx, options);
      return finalizeDecodedWarnings(fallback, options, { selectorMismatch: true });
    }
  }

  return finalizeDecodedWarnings(await fallbackOperation(tx, options), options);
}
