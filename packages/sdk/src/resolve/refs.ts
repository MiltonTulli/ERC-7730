import { DescriptorResolveError } from './error.js';
import { isPlainObject } from './util.js';

const DEFINITIONS_PREFIX = '$.display.definitions.';

function definitionId(ref: string): string | undefined {
  if (!ref.startsWith(DEFINITIONS_PREFIX)) {
    return undefined;
  }
  const id = ref.slice(DEFINITIONS_PREFIX.length);
  if (!id || id.includes('.') || id.includes('/')) {
    return undefined;
  }
  return id;
}

function lookupDefinition(merged: Record<string, unknown>, ref: string): Record<string, unknown> {
  const id = definitionId(ref);
  if (id === undefined) {
    throw new DescriptorResolveError(
      `Field $ref must point at ${DEFINITIONS_PREFIX}<id>, got "${ref}"`,
      '/display'
    );
  }

  const display = merged.display;
  if (!isPlainObject(display)) {
    throw new DescriptorResolveError(`Missing display.definitions.${id}`, '/display/definitions');
  }
  const definitions = display.definitions;
  if (!isPlainObject(definitions) || !isPlainObject(definitions[id])) {
    throw new DescriptorResolveError(`Unknown display definition "${id}"`, '/display/definitions');
  }
  return definitions[id];
}

function mergeParams(base: unknown, overlay: unknown): unknown {
  if (overlay === undefined) {
    return base;
  }
  if (base === undefined) {
    return overlay;
  }
  if (isPlainObject(base) && isPlainObject(overlay)) {
    return { ...base, ...overlay };
  }
  return overlay;
}

function inlineField(
  field: Record<string, unknown>,
  merged: Record<string, unknown>
): Record<string, unknown> {
  const ref = field.$ref;
  if (typeof ref !== 'string') {
    return inlineNested(field, merged);
  }

  const definition = lookupDefinition(merged, ref);
  const { $ref: _ignored, ...rest } = field;
  const inlined: Record<string, unknown> = { ...definition, ...rest };
  if (definition.params !== undefined || rest.params !== undefined) {
    inlined.params = mergeParams(definition.params, rest.params);
  }
  return inlineNested(inlined, merged);
}

function inlineNested(
  field: Record<string, unknown>,
  merged: Record<string, unknown>
): Record<string, unknown> {
  if (Array.isArray(field.fields)) {
    return { ...field, fields: field.fields.map((item) => inlineFieldItem(item, merged)) };
  }
  return field;
}

function inlineFieldItem(item: unknown, merged: Record<string, unknown>): unknown {
  if (!isPlainObject(item)) {
    return item;
  }
  return inlineField(item, merged);
}

function inlineFormats(
  formats: Record<string, unknown>,
  merged: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, format] of Object.entries(formats)) {
    if (!isPlainObject(format) || !Array.isArray(format.fields)) {
      out[key] = format;
      continue;
    }
    out[key] = {
      ...format,
      fields: format.fields.map((item) => inlineFieldItem(item, merged)),
    };
  }
  return out;
}

/**
 * Inline `$.display.definitions.*` field `$ref`s.
 *
 * Enum `params.$ref` values (`$.metadata.enums.*`) are left in place — that is
 * the v2 enum format parameter, not a field definition include.
 */
export function inlineFieldRefs(merged: Record<string, unknown>): Record<string, unknown> {
  const display = merged.display;
  if (!isPlainObject(display) || !isPlainObject(display.formats)) {
    return merged;
  }
  return {
    ...merged,
    display: {
      ...display,
      formats: inlineFormats(display.formats, merged),
    },
  };
}

export function collectFieldRefs(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFieldRefs(item, acc);
    }
    return acc;
  }
  if (!isPlainObject(value)) {
    return acc;
  }
  if (typeof value.$ref === 'string' && definitionId(value.$ref)) {
    acc.push(value.$ref);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'params') {
      continue;
    }
    collectFieldRefs(child, acc);
  }
  return acc;
}
