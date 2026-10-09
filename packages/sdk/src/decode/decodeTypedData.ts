import { InvalidInputError } from '../errors';
import type { PathContext } from '../path/types';
import type { TransactionInput, TypedDataInput } from '../types';
import type { Hex, ResolvedDescriptor } from '../types/descriptor';
import {
  absorbEmbedded,
  appendUntrustedWarning,
  asAddress,
  asRecord,
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
import { matchEip712Format } from './match';
import { beginDecode, endDecode, failDecode } from './session';
import { encodeType, hashEncodeType, normalizeTypedDataMessage } from './typedData';
import type {
  Address,
  DecodeOptions,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
  TrustReport,
} from './types';
import { validateTypedDataInput } from './validate';
import { finalizeDecodedWarnings } from './warnings';

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
    typedData: data,
    provider: options?.provider,
    cacheObserver: options?.cacheObserver,
    fromBlock: options?.fromBlock,
    toBlock: options?.toBlock,
    diagnosticLog: options?.diagnosticLog,
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
    from: from as `0x${string}` | undefined,
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
    externalDataProvider: options?.externalDataProvider,
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
  const rendered = renderIntent(
    matched.format.intent,
    matched.format.interpolatedIntent,
    fields,
    options?.locale ?? 'en'
  );
  if (rendered.interpolationFailed) {
    warnings.push(interpolationFailedWarning());
  }
  const intent = rendered.intent === 'Contract interaction' ? fallbackIntent : rendered.intent;
  const absorbed = absorbEmbedded(fields, warnings, confidenceFor(source, trust.accepted));

  return {
    confidence: absorbed.confidence,
    source,
    intent,
    interpolatedIntent: rendered.interpolatedIntent,
    functionName: data.primaryType,
    signature: matched.key,
    fields,
    excluded,
    warnings: absorbed.warnings,
    trust,
    diagnostics: [],
    metadata: {
      ...meta,
      chainId,
      contractAddress: address,
      registryPath: resolved.registryPath,
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
  chainId: number | undefined,
  address: Address | undefined,
  options: DecodeOptions | undefined,
  trustOverride?: TrustReport
): Promise<DecodedOperation> {
  const source: DecodeSource = 'inferred';
  const fields: DecodedField[] = [];
  const typeFields = data.types[data.primaryType] ?? [];
  const warnings: SecurityWarning[] = [];

  if (typeFields.length > 0) {
    for (const field of typeFields) {
      const rawValue = message[field.name];
      const label = field.name.charAt(0).toUpperCase() + field.name.slice(1);
      if (field.type === 'address' && typeof rawValue === 'string' && rawValue.startsWith('0x')) {
        fields.push({
          path: field.name,
          label,
          format: 'addressName',
          value: formatRaw(rawValue),
          rawValue,
          required: false,
          details: { address: rawValue as Address, nameSource: 'none' },
        });
      } else {
        fields.push({
          path: field.name,
          label,
          format: 'raw',
          value: formatRaw(rawValue),
          rawValue,
          required: false,
          details: { raw: rawValue },
        });
      }
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
        details: { raw: rawValue },
      });
    }
  }

  const trust = trustOverride ?? (await resolveTrust(options, source, undefined, chainId, address));
  if (!trustOverride) {
    appendUntrustedWarning(warnings, trust, source);
  }
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
    diagnostics: [],
    metadata: {
      chainId,
      contractAddress: address,
    },
    raw: {
      message,
    },
  };
}

async function presentDescriptorResult(
  rendered: DecodedOperation,
  data: TypedDataInput,
  message: Record<string, unknown>,
  encoded: string,
  chainId: number,
  address: Address | undefined,
  options: DecodeOptions | undefined
): Promise<DecodedOperation> {
  const upgraded = withAttestedSource(rendered);
  if (!attestationFailed(upgraded.trust)) {
    return upgraded;
  }
  const fallback = await fallbackOperation(
    data,
    message,
    encoded,
    chainId,
    address,
    options,
    upgraded.trust
  );
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

/**
 * Decode an EIP-712 payload using an official (or override) descriptor from
 * `index.eip712.json`. Lookup is CAIP-10 `eip155:{chainId}:{verifyingContract}`
 * plus `primaryType` / keccak256(`encodeType`). Without a match, falls back to
 * inferred fields from the payload types — never `confidence: "high"`.
 */
async function decodeTypedDataCore(
  data: TypedDataInput,
  options: DecodeOptions | undefined
): Promise<DecodedOperation> {
  const chainId = chainIdOf(data);
  const address = verifyingContractOf(data);
  const encoded = encodeType(data.primaryType, data.types);
  const encodeTypeHash = hashEncodeType(data.primaryType, data.types);
  const message = asRecord(data.message)
    ? normalizeTypedDataMessage(data.message, data.types, data.primaryType)
    : {};

  const registry = options?.registry;
  if (!registry || chainId === undefined || !address || typeof registry.findEip712 !== 'function') {
    options?.diagnosticLog?.push({
      stage: 'registry-lookup',
      outcome: 'skipped',
      code: 'REGISTRY_SKIPPED',
      message: 'No EIP-712 registry lookup for this payload',
    });
  }

  let found: ResolvedDescriptor | null = null;
  try {
    found = await lookupEip712(data, options, chainId, address, encodeTypeHash);
  } catch (error) {
    if (error instanceof InvalidInputError) {
      throw error;
    }
    options?.diagnosticLog?.push({
      stage: 'include-resolve',
      outcome: 'error',
      code: 'INCLUDE_FETCH_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
    found = null;
  }

  if (registry && chainId !== undefined && address && typeof registry.findEip712 === 'function') {
    if (!found) {
      if (!options?.diagnosticLog?.entries.some((entry) => entry.code === 'INCLUDE_FETCH_FAILED')) {
        options?.diagnosticLog?.push({
          stage: 'registry-lookup',
          outcome: 'miss',
          code: 'REGISTRY_NO_DESCRIPTOR',
          message: 'No EIP-712 descriptor for this domain',
          details: { chainId, address, primaryType: data.primaryType },
        });
        options?.onEvent?.({ type: 'registry:miss', chainId, address });
      }
    } else {
      options?.diagnosticLog?.push({
        stage: 'registry-lookup',
        outcome: 'hit',
        code: 'REGISTRY_HIT',
        message: 'Registry returned an EIP-712 descriptor',
        details: { chainId, address, registryPath: found.registryPath },
      });
      const bound = await matchContext(found, data, {
        provider: options?.provider,
        fromBlock: options?.fromBlock,
        toBlock: options?.toBlock,
        diagnosticLog: options?.diagnosticLog,
      });
      if (!bound.matched) {
        options?.diagnosticLog?.push({
          stage: 'context-match',
          outcome: 'miss',
          code: bound.reason === 'chain_id' ? 'CHAIN_ID_MISMATCH' : 'CONTEXT_MISMATCH',
          message:
            bound.reason === 'chain_id'
              ? 'Descriptor deployments do not include this chainId'
              : 'EIP-712 context did not match this payload',
          details: { chainId, address, reason: bound.reason },
        });
      } else {
        options?.diagnosticLog?.push({
          stage: 'context-match',
          outcome: 'hit',
          code: 'CONTEXT_MATCHED',
          message: 'EIP-712 context matched',
          details: { via: bound.via },
        });
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
        if (!rendered) {
          options?.diagnosticLog?.push({
            stage: 'format-match',
            outcome: 'miss',
            code: 'SELECTOR_NOT_IN_FORMATS',
            message: 'primaryType is not listed in the descriptor formats',
            details: { primaryType: data.primaryType },
          });
        } else {
          options?.diagnosticLog?.push({
            stage: 'format-match',
            outcome: 'hit',
            code: 'FORMAT_MATCHED',
            message: 'primaryType matched a display format',
            details: { primaryType: data.primaryType },
          });
          return finalizeDecodedWarnings(
            await presentDescriptorResult(
              rendered,
              data,
              message,
              encoded,
              chainId,
              address,
              options
            ),
            options
          );
        }
      }
    }
  }

  const fallback = await fallbackOperation(data, message, encoded, chainId, address, options);
  options?.diagnosticLog?.push({
    stage: 'fallback',
    outcome: 'hit',
    code: 'INFERRED_FALLBACK',
    message: 'No EIP-712 descriptor; showing fields from the typed-data message',
  });
  return finalizeDecodedWarnings(fallback, options);
}

export async function decodeTypedData(
  data: TypedDataInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  validateTypedDataInput(data);
  const session = beginDecode('typed-data', options);
  try {
    const operation = await decodeTypedDataCore(data, session.options);
    return endDecode('typed-data', options, session, operation);
  } catch (error) {
    failDecode('typed-data', options, session.started);
    throw error;
  }
}
