import { decodeCalldata, extractSelector } from '../core/decoder.js';
import { getSignatureBySelector } from '../core/signatures.js';
import { generateDescriptor } from '../generate/generate.js';
import type { ABI } from '../generate/generate.js';
import { ERC20_DESCRIPTOR } from '../registry/erc20.js';
import { ERC721_DESCRIPTOR } from '../registry/erc721.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import type { Hex, InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';
import type { TransactionInput } from '../types/index.js';
import { decodeNamedArgs, parseDeclaration } from './abi.js';
import { getDefaultVerifiedAbiLoader } from './abiLoader.js';
import {
  ZERO_ADDRESS,
  absorbEmbedded,
  appendUntrustedWarning,
  asAddress,
  attestationFailed,
  confidenceFor,
  interpolationFailedWarning,
  noTrustedAttestationWarning,
  readMetadata,
  renderIntent,
  resolveTrust,
  sourceFromResolved,
  withAttestedSource,
} from './common.js';
import { matchContext } from './context.js';
import { type FormatOptions, flattenFields, formatDisplayField } from './format.js';
import { expandNestedCalls } from './innerCalls.js';
import { matchFormat } from './match.js';
import type { PathContext } from './path.js';
import type {
  DecodeOptions,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
  TrustReport,
  TrustedTokenStandard,
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

function lookupTrustedToken(
  options: DecodeOptions | undefined,
  chainId: number,
  address: string
): TrustedTokenStandard | undefined {
  const map = options?.trustedTokens?.[chainId];
  if (!map) {
    return undefined;
  }
  const want = address.toLowerCase();
  for (const [key, standard] of Object.entries(map)) {
    if (key.toLowerCase() === want) {
      return standard;
    }
  }
  return undefined;
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
  const depth = options?.calldataDepth ?? 0;
  const formatOptions: FormatOptions = {
    provider: options?.provider ?? null,
    locale: options?.locale ?? 'en',
    externalDataProvider: options?.externalDataProvider,
    calldataDepth: depth,
    onCalldata:
      depth < 2
        ? (inner) =>
            decodeTransaction(inner, {
              ...options,
              calldataDepth: depth + 1,
            })
        : undefined,
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
  const rendered = renderIntent(
    matched.format.intent,
    matched.format.interpolatedIntent,
    fields,
    options?.locale ?? 'en'
  );
  if (rendered.interpolationFailed) {
    warnings.push(interpolationFailedWarning());
  }

  const absorbed = absorbEmbedded(fields, warnings, confidenceFor(source, trust.accepted));

  return {
    confidence: absorbed.confidence,
    source,
    intent: rendered.intent,
    interpolatedIntent: rendered.interpolatedIntent,
    functionName: declaration?.name,
    signature: declaration?.canonical ?? matched.key,
    selector,
    fields,
    excluded,
    warnings: absorbed.warnings,
    trust,
    metadata: {
      ...meta,
      chainId: tx.chainId,
      contractAddress: asAddress(tx.to),
      registryPath: resolved.registryPath,
    },
    raw: {
      selector,
      args: decoded.positional,
    },
  };
}

async function tryVerifiedAbi(
  tx: TransactionInput,
  selector: Hex | undefined,
  options: DecodeOptions | undefined
): Promise<{ operation: DecodedOperation | null; selectorMismatch: boolean }> {
  if (!tx.to || tx.to.toLowerCase() === ZERO_ADDRESS) {
    return { operation: null, selectorMismatch: false };
  }
  const useFallback = options?.useSourcifyFallback === true;
  const loader =
    options?.loadVerifiedAbi ?? (useFallback ? getDefaultVerifiedAbiLoader() : undefined);
  if (!useFallback || !loader) {
    return { operation: null, selectorMismatch: false };
  }
  try {
    const result = await loader(tx.chainId, asAddress(tx.to));
    if (!result?.abi) {
      return { operation: null, selectorMismatch: false };
    }
    const abi = result.abi as ABI;
    const selectorMismatch = selector ? sourcifySelectorMismatch(abi, selector) : false;
    const generated = generateDescriptor({
      chainId: tx.chainId,
      address: tx.to,
      abi,
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

async function fallbackOperation(
  tx: TransactionInput,
  options: DecodeOptions | undefined,
  trustOverride?: TrustReport
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

  const trust =
    trustOverride ?? (await resolveTrust(options, source, undefined, tx.chainId, asAddress(tx.to)));
  const warnings: SecurityWarning[] = [];
  if (!trustOverride) {
    appendUntrustedWarning(warnings, trust, source);
  }
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
}

async function presentDescriptorResult(
  rendered: DecodedOperation,
  tx: TransactionInput,
  options: DecodeOptions | undefined
): Promise<DecodedOperation> {
  const upgraded = withAttestedSource(rendered);
  if (!attestationFailed(upgraded.trust)) {
    return upgraded;
  }
  const fallback = await fallbackOperation(tx, options, upgraded.trust);
  const warnings = [...fallback.warnings];
  if (!warnings.some((warning) => warning.type === 'NO_TRUSTED_ATTESTATION')) {
    warnings.push(noTrustedAttestationWarning());
  }
  return {
    ...fallback,
    source: upgraded.source === 'attested' ? 'official-registry' : upgraded.source,
    confidence: 'low',
    trust: upgraded.trust,
    metadata: upgraded.metadata,
    warnings,
  };
}

async function tryTrustedToken(
  tx: TransactionInput,
  selector: Hex | undefined,
  options: DecodeOptions | undefined
): Promise<DecodedOperation | null> {
  if (!selector || !tx.to) {
    return null;
  }
  const standard = lookupTrustedToken(options, tx.chainId, tx.to);
  if (!standard) {
    return null;
  }
  const template = standard === 'erc721' ? ERC721_DESCRIPTOR : ERC20_DESCRIPTOR;
  const resolved = await resolveDescriptor(
    template as InputDescriptor,
    createMemoryIncludeLoader({})
  );
  const rendered = await renderFromDescriptor(tx, resolved, 'trusted-token', selector, options);
  return rendered;
}

async function decodeTransactionCore(
  tx: TransactionInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  const selector = selectorFromTx(tx);
  const useSourcify = options?.useSourcifyFallback === true;

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
          return finalizeDecodedWarnings(
            await presentDescriptorResult(rendered, tx, options),
            options
          );
        }
      }
    }
  }

  if (selector) {
    const trusted = await tryTrustedToken(tx, selector, options);
    if (trusted) {
      return finalizeDecodedWarnings(trusted, options);
    }
  }

  if (useSourcify && selector) {
    const verified = await tryVerifiedAbi(tx, selector, options);
    if (verified.operation) {
      return finalizeDecodedWarnings(verified.operation, options, {
        selectorMismatch: verified.selectorMismatch,
      });
    }
    if (verified.selectorMismatch) {
      const fallback = await fallbackOperation(tx, options);
      return finalizeDecodedWarnings(fallback, options, { selectorMismatch: true });
    }
  }

  return finalizeDecodedWarnings(await fallbackOperation(tx, options), options);
}

/**
 * Decode a transaction using an official (or override) descriptor's
 * `display.formats`. Without a match, falls back to trusted-token templates,
 * optional Sourcify, then inferred / basic — never `confidence: "high"` for
 * those sources. Multicall3 / Safe CALL expand into `children`.
 */
export async function decodeTransaction(
  tx: TransactionInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  const core = await decodeTransactionCore(tx, options);
  return expandNestedCalls(core, tx, options);
}
