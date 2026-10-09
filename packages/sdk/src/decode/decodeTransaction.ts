import { decodeCalldata, extractSelector } from '../core/decoder';
import { computeSelector, getSignatureBySelector } from '../core/signatures';
import { InvalidInputError } from '../errors';
import type { ABI } from '../generate/generate';
import type { PathContext } from '../path/types';
import { ERC20_DESCRIPTOR } from '../registry/erc20';
import { ERC721_DESCRIPTOR } from '../registry/erc721';
import { WETH_DESCRIPTOR } from '../registry/weth';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve';
import type { TransactionInput } from '../types';
import type { Hex, ResolvedDescriptor } from '../types/descriptor';
import { decodeNamedArgs, parseDeclaration, wellKnownAliases } from './abi';
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
} from './common';
import { matchContext } from './context';
import { type FormatOptions, flattenFields, formatDisplayField } from './format';
import { expandNestedCalls } from './innerCalls';
import { matchFormat } from './match';
import { beginDecode, endDecode, failDecode } from './session';
import type {
  DecodeOptions,
  DecodeRunState,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
  TrustReport,
  TrustedTokenStandard,
} from './types';
import { validateTransactionInput } from './validate';
import { finalizeDecodedWarnings, sourcifySelectorMismatch } from './warnings';

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
  options: (DecodeOptions & DecodeRunState) | undefined
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
            decodeTransactionRun(inner, {
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
    diagnostics: [],
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
  const loader = options?.loadVerifiedAbi;
  if (!useFallback || !loader) {
    return { operation: null, selectorMismatch: false };
  }
  try {
    const result = await loader(tx.chainId, asAddress(tx.to));
    if (!result?.abi && !result?.descriptor) {
      return { operation: null, selectorMismatch: false };
    }
    const selectorMismatch =
      selector && result.abi ? sourcifySelectorMismatch(result.abi as ABI, selector) : false;
    if (!result.descriptor) {
      return { operation: null, selectorMismatch };
    }
    const resolved = await resolveDescriptor(result.descriptor, createMemoryIncludeLoader({}));
    const operation = await renderFromDescriptor(tx, resolved, 'sourcify', selector, options);
    return { operation, selectorMismatch };
  } catch (error) {
    options?.diagnosticLog?.push({
      stage: 'fallback',
      outcome: 'error',
      code: 'VERIFIED_ABI_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
    return { operation: null, selectorMismatch: false };
  }
}

const READABLE_LABELS: Record<string, string> = {
  to: 'To',
  amount: 'Amount',
  spender: 'Spender',
};

async function fallbackOperation(
  tx: TransactionInput,
  options: DecodeOptions | undefined,
  trustOverride?: TrustReport
): Promise<DecodedOperation> {
  const selector = selectorFromTx(tx);
  const signatures = options?.signatures;
  const raw = selector ? decodeCalldata(tx, signatures) : null;
  const known = selector ? getSignatureBySelector(selector, signatures) : null;
  const source: DecodeSource = known || raw?.signature ? 'inferred' : 'basic';
  const fields: DecodedField[] = [];

  if (raw) {
    const declaration = raw.signature ? parseDeclaration(raw.signature) : null;
    const aliases = declaration ? wellKnownAliases(declaration.canonical) : undefined;
    for (let i = 0; i < raw.args.length; i++) {
      const type = raw.inputTypes[i] || 'unknown';
      const value = raw.args[i];
      const paramName = declaration?.params[i]?.name;
      const alias = paramName || aliases?.[i];
      const label = (alias && READABLE_LABELS[alias]) || alias || `Param ${i + 1}`;
      let format: DecodedField['format'] = 'raw';
      let formatted = typeof value === 'bigint' ? value.toString() : String(value ?? 'Unknown');
      if (type === 'address' && typeof value === 'string') {
        format = 'addressName';
        formatted = value;
      }
      if (format === 'addressName' && typeof value === 'string') {
        fields.push({
          path: alias ?? `[${i}]`,
          label,
          format: 'addressName',
          value: formatted,
          rawValue: value,
          required: false,
          details: { address: value as `0x${string}`, nameSource: 'none' },
        });
      } else {
        fields.push({
          path: alias ?? `[${i}]`,
          label,
          format: 'raw',
          value: formatted,
          rawValue: value,
          required: false,
          details: { raw: value },
        });
      }
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
    diagnostics: [],
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
  if (!warnings.some((warning) => warning.type === 'no_trusted_attestation')) {
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

const builtinIncludeLoader = createMemoryIncludeLoader({});
const builtinResolved = {
  erc20: resolveDescriptor(ERC20_DESCRIPTOR, builtinIncludeLoader),
  erc721: resolveDescriptor(ERC721_DESCRIPTOR, builtinIncludeLoader),
  weth: resolveDescriptor(WETH_DESCRIPTOR, builtinIncludeLoader),
};

const ERC721_ONLY_SELECTORS = new Set([
  computeSelector('safeTransferFrom(address,address,uint256)'),
  computeSelector('safeTransferFrom(address,address,uint256,bytes)'),
  computeSelector('setApprovalForAll(address,bool)'),
]);

function isWethDeployment(chainId: number, address: string): boolean {
  const context = WETH_DESCRIPTOR.context;
  if (!context || !('contract' in context)) {
    return false;
  }
  const deployments = context.contract.deployments ?? [];
  const want = address.toLowerCase();
  return deployments.some(
    (item) => item.chainId === chainId && item.address?.toLowerCase() === want
  );
}

async function tryBuiltin(
  tx: TransactionInput,
  selector: Hex | undefined,
  options: DecodeOptions | undefined
): Promise<DecodedOperation | null> {
  if (options?.builtins === false || !selector || !tx.to) {
    return null;
  }
  if (isWethDeployment(tx.chainId, tx.to)) {
    const rendered = await renderFromDescriptor(
      tx,
      await builtinResolved.weth,
      'builtin',
      selector,
      options
    );
    if (rendered) {
      return rendered;
    }
  }
  const resolved = ERC721_ONLY_SELECTORS.has(selector.toLowerCase())
    ? await builtinResolved.erc721
    : await builtinResolved.erc20;
  return renderFromDescriptor(tx, resolved, 'builtin', selector, options);
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
  const resolved = await resolveDescriptor(template, createMemoryIncludeLoader({}));
  const rendered = await renderFromDescriptor(tx, resolved, 'trusted-token', selector, options);
  return rendered;
}

function pushDiagnostic(
  options: DecodeOptions | undefined,
  entry: Parameters<NonNullable<DecodeOptions['diagnosticLog']>['push']>[0]
): void {
  options?.diagnosticLog?.push(entry);
}

async function decodeTransactionCore(
  tx: TransactionInput,
  options?: DecodeOptions & DecodeRunState
): Promise<DecodedOperation> {
  const selector = selectorFromTx(tx);
  const useSourcify = options?.useSourcifyFallback === true;

  if (!options?.registry) {
    pushDiagnostic(options, {
      stage: 'registry-lookup',
      outcome: 'skipped',
      code: 'REGISTRY_SKIPPED',
      message: 'No registry was provided',
    });
  } else if (!selector) {
    pushDiagnostic(options, {
      stage: 'registry-lookup',
      outcome: 'skipped',
      code: 'REGISTRY_SKIPPED',
      message: 'Transaction has no 4-byte selector',
    });
  } else {
    let found: Awaited<ReturnType<NonNullable<DecodeOptions['registry']>['findCalldata']>> = null;
    try {
      found = await options.registry.findCalldata({
        chainId: tx.chainId,
        address: asAddress(tx.to),
        selector,
        provider: options.provider,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
        cacheObserver: options.cacheObserver,
        diagnosticLog: options.diagnosticLog,
      });
    } catch (error) {
      if (error instanceof InvalidInputError) {
        throw error;
      }
      pushDiagnostic(options, {
        stage: 'include-resolve',
        outcome: 'error',
        code: 'INCLUDE_FETCH_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
      found = null;
    }
    if (!found) {
      if (!options.diagnosticLog?.entries.some((entry) => entry.code === 'INCLUDE_FETCH_FAILED')) {
        pushDiagnostic(options, {
          stage: 'registry-lookup',
          outcome: 'miss',
          code: 'REGISTRY_NO_DESCRIPTOR',
          message: 'No descriptor for this chain and address',
          details: { chainId: tx.chainId, address: tx.to, selector },
        });
        options.onEvent?.({
          type: 'registry:miss',
          chainId: tx.chainId,
          address: tx.to,
        });
      }
    } else {
      pushDiagnostic(options, {
        stage: 'registry-lookup',
        outcome: 'hit',
        code: 'REGISTRY_HIT',
        message: 'Registry returned a descriptor',
        details: { chainId: tx.chainId, address: tx.to, registryPath: found.registryPath },
      });
      const bound = await matchContext(found, tx, {
        provider: options.provider,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
        diagnosticLog: options.diagnosticLog,
      });
      if (!bound.matched) {
        pushDiagnostic(options, {
          stage: 'context-match',
          outcome: 'miss',
          code: bound.reason === 'chain_id' ? 'CHAIN_ID_MISMATCH' : 'CONTEXT_MISMATCH',
          message:
            bound.reason === 'chain_id'
              ? 'Descriptor deployments do not include this chainId'
              : 'Descriptor context did not match this transaction',
          details: { chainId: tx.chainId, address: tx.to, reason: bound.reason },
        });
      } else {
        pushDiagnostic(options, {
          stage: 'context-match',
          outcome: 'hit',
          code: 'CONTEXT_MATCHED',
          message: `Context matched via ${bound.via ?? 'deployment'}`,
          details: { via: bound.via },
        });
        const rendered = await renderFromDescriptor(
          tx,
          found,
          sourceFromResolved(found),
          selector,
          options
        );
        if (!rendered) {
          pushDiagnostic(options, {
            stage: 'format-match',
            outcome: 'miss',
            code: 'SELECTOR_NOT_IN_FORMATS',
            message: 'Selector is not listed in the descriptor formats',
            details: { selector },
          });
        } else {
          pushDiagnostic(options, {
            stage: 'format-match',
            outcome: 'hit',
            code: 'FORMAT_MATCHED',
            message: 'Selector matched a display format',
            details: { selector, signature: rendered.signature },
          });
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
      pushDiagnostic(options, {
        stage: 'fallback',
        outcome: 'hit',
        code: 'TRUSTED_TOKEN_FALLBACK',
        message: 'Rendered from a trusted-token template',
      });
      return finalizeDecodedWarnings(trusted, options);
    }
    const builtin = await tryBuiltin(tx, selector, options);
    if (builtin) {
      pushDiagnostic(options, {
        stage: 'fallback',
        outcome: 'hit',
        code: 'BUILTIN_FALLBACK',
        message: 'Rendered from an ERC-20, ERC-721, or WETH builtin',
      });
      return finalizeDecodedWarnings(builtin, options);
    }
  }

  if (useSourcify && selector) {
    const verified = await tryVerifiedAbi(tx, selector, options);
    if (verified.operation) {
      pushDiagnostic(options, {
        stage: 'fallback',
        outcome: 'hit',
        code: 'SOURCIFY_FALLBACK',
        message: 'Rendered from a Sourcify ABI',
      });
      return finalizeDecodedWarnings(verified.operation, options, {
        selectorMismatch: verified.selectorMismatch,
      });
    }
    if (verified.selectorMismatch) {
      const fallback = await fallbackOperation(tx, options);
      pushDiagnostic(options, {
        stage: 'fallback',
        outcome: 'hit',
        code: 'INFERRED_FALLBACK',
        message: 'Sourcify ABI did not match the selector',
      });
      return finalizeDecodedWarnings(fallback, options, { selectorMismatch: true });
    }
  }

  const fallback = await fallbackOperation(tx, options);
  pushDiagnostic(options, {
    stage: 'fallback',
    outcome: 'hit',
    code: fallback.source === 'basic' ? 'BASIC_FALLBACK' : 'INFERRED_FALLBACK',
    message:
      fallback.source === 'basic'
        ? 'No descriptor or known signature; showing the raw call'
        : 'No descriptor; showing fields inferred from a known signature',
  });
  return finalizeDecodedWarnings(fallback, options);
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
  return decodeTransactionRun(tx, options);
}

/** Same decode, with recursion counters that stay off {@link DecodeOptions}. */
export async function decodeTransactionRun(
  tx: TransactionInput,
  options?: DecodeOptions & DecodeRunState
): Promise<DecodedOperation> {
  validateTransactionInput(tx);
  const session = beginDecode('transaction', options);
  try {
    const core = await decodeTransactionCore(tx, session.options);
    const expanded = await expandNestedCalls(core, tx, session.options);
    return endDecode('transaction', options, session, expanded);
  } catch (error) {
    failDecode('transaction', options, session.started);
    throw error;
  }
}
