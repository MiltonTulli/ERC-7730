import type { PathContext } from '../path/types';
import type { TransactionInput, TypedDataInput } from '../types';
import type { ResolvedDescriptor } from '../types/descriptor';
import { formatRaw } from '../util';
import {
  absorbEmbedded,
  appendUntrustedWarning,
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
import { matchEip712Format } from './match';
import type {
  Address,
  DecodeOptions,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
  TrustReport,
} from './types';

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

export async function renderFromDescriptor(
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

export async function fallbackOperation(
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

export async function presentDescriptorResult(
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
