import type { ERC7730Descriptor, InputDescriptor } from '@erc7730/sdk';
import { GENERATED_COMMENT, V2_SCHEMA_URI } from './types.js';

const ADDRESS_NAME_TYPES = new Set(['wallet', 'eoa', 'contract', 'token', 'collection']);

function rewriteAddressNameTypes(types: unknown): string[] | undefined {
  if (!Array.isArray(types)) {
    return undefined;
  }
  const out: string[] = [];
  for (const value of types) {
    if (typeof value !== 'string') {
      continue;
    }
    const mapped = value === 'nft' ? 'collection' : value;
    if (ADDRESS_NAME_TYPES.has(mapped) && !out.includes(mapped)) {
      out.push(mapped);
    }
  }
  return out.length > 0 ? out : undefined;
}

function rewriteField(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const field = value as Record<string, unknown>;
  if (Array.isArray(field.fields)) {
    return { ...field, fields: field.fields.map(rewriteField) };
  }
  const params = field.params;
  if (
    field.format === 'addressName' &&
    params &&
    typeof params === 'object' &&
    !Array.isArray(params) &&
    'types' in params
  ) {
    const rest = { ...(params as Record<string, unknown>) };
    const { types: originalTypes, ...withoutTypes } = rest;
    const mapped = rewriteAddressNameTypes(originalTypes);
    const next = mapped ? { ...withoutTypes, types: mapped } : withoutTypes;
    return { ...field, params: next };
  }
  return field;
}

function rewriteDisplay(display: unknown): unknown {
  if (!display || typeof display !== 'object') {
    return display;
  }
  const rec = display as Record<string, unknown>;
  const formats = rec.formats;
  if (!formats || typeof formats !== 'object') {
    return display;
  }
  const nextFormats: Record<string, unknown> = {};
  for (const [key, format] of Object.entries(formats as Record<string, unknown>)) {
    if (!format || typeof format !== 'object') {
      nextFormats[key] = format;
      continue;
    }
    const entry = format as Record<string, unknown>;
    nextFormats[key] = Array.isArray(entry.fields)
      ? { ...entry, fields: entry.fields.map(rewriteField) }
      : entry;
  }
  return { ...rec, formats: nextFormats };
}

/**
 * Adapt `generateDescriptor()` output so it validates as ERC-7730 v2.
 *
 * The SDK generator still emits a v1-shaped draft (runtime Sourcify fallback).
 * CLI generate rewrites `$schema` and maps v1 `addressName` type `nft` →
 * `collection` (the v2 enum).
 */
export function toV2Draft(descriptor: ERC7730Descriptor): InputDescriptor {
  const out: Record<string, unknown> = {
    $schema: V2_SCHEMA_URI,
    $comment: GENERATED_COMMENT,
    context: descriptor.context,
  };
  if (descriptor.metadata) {
    out.metadata = descriptor.metadata;
  }
  out.display = rewriteDisplay(descriptor.display);
  return out as InputDescriptor;
}
