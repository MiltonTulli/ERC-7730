import { decodeCalldata, extractSelector } from '../core/decoder';
import { computeSelector, getSignatureBySelector } from '../core/signatures';
import type { PathContext } from '../path/types';
import { ERC20_DESCRIPTOR } from '../registry/erc20';
import { ERC721_DESCRIPTOR } from '../registry/erc721';
import { WETH_DESCRIPTOR } from '../registry/weth';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve';
import type { TransactionInput } from '../types';
import type { Hex, InputDescriptor, ResolvedDescriptor } from '../types/descriptor';
import { parseTxValue } from '../util';
import { decodeNamedArgs, parseDeclaration, wellKnownAliases } from './abi';
import {
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
  withAttestedSource,
} from './common';
import { type FormatOptions, flattenFields, formatDisplayField } from './format';
import { matchFormat } from './match';
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

function asHex(value: string): Hex {
  return value as Hex;
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

export function selectorFromTx(tx: TransactionInput): Hex | undefined {
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

export async function renderFromDescriptor(
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
  const decodeRun = options?.decodeRun;
  const formatOptions: FormatOptions = {
    provider: options?.provider ?? null,
    locale: options?.locale ?? 'en',
    externalDataProvider: options?.externalDataProvider,
    calldataDepth: depth,
    onCalldata:
      depth < 2 && decodeRun
        ? (inner) => decodeRun(inner, { ...options, calldataDepth: depth + 1 })
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

const READABLE_LABELS: Record<string, string> = {
  to: 'To',
  amount: 'Amount',
  spender: 'Spender',
};

export async function fallbackOperation(
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

export async function presentDescriptorResult(
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

type BuiltinName = 'erc20' | 'erc721' | 'weth';

const BUILTIN_TEMPLATES: Record<BuiltinName, InputDescriptor> = {
  erc20: ERC20_DESCRIPTOR,
  erc721: ERC721_DESCRIPTOR,
  weth: WETH_DESCRIPTOR,
};

const builtinResolved = new Map<BuiltinName, Promise<ResolvedDescriptor>>();

/** Resolved on first use so importing the SDK does not compile the schemas. */
function resolvedBuiltin(name: BuiltinName): Promise<ResolvedDescriptor> {
  let pending = builtinResolved.get(name);
  if (!pending) {
    pending = resolveDescriptor(BUILTIN_TEMPLATES[name], createMemoryIncludeLoader({}));
    pending.catch(() => builtinResolved.delete(name));
    builtinResolved.set(name, pending);
  }
  return pending;
}

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

export async function tryBuiltin(
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
      await resolvedBuiltin('weth'),
      'builtin',
      selector,
      options
    );
    if (rendered) {
      return rendered;
    }
  }
  const resolved = ERC721_ONLY_SELECTORS.has(selector.toLowerCase())
    ? await resolvedBuiltin('erc721')
    : await resolvedBuiltin('erc20');
  return renderFromDescriptor(tx, resolved, 'builtin', selector, options);
}

export async function tryTrustedToken(
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
  const resolved = await resolvedBuiltin(standard === 'erc721' ? 'erc721' : 'erc20');
  const rendered = await renderFromDescriptor(tx, resolved, 'trusted-token', selector, options);
  return rendered;
}
