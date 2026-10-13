// Drops JSON Schema annotation keywords that Ajv does not use for validation.
// Keys under `properties`, `$defs`, and similar maps are names, not keywords, so they stay.
// The v1 schema also keeps `$ref` targets under custom maps such as `$display`; an
// annotation is only dropped when its value has the annotation's type, so a target
// named `title` (an object) survives.
const TEXT_ANNOTATIONS = new Set(['title', 'description', '$comment', 'markdownDescription']);

function isAnnotation(key, value) {
  if (TEXT_ANNOTATIONS.has(key)) {
    return typeof value === 'string';
  }
  return key === 'examples' && Array.isArray(value);
}
const SCHEMA_MAPS = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
]);
const DATA_KEYWORDS = new Set(['const', 'enum', 'default']);

function stripMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return map;
  }
  return Object.fromEntries(
    Object.entries(map).map(([name, schema]) => [name, stripSchemaAnnotations(schema)])
  );
}

export function stripSchemaAnnotations(schema) {
  if (Array.isArray(schema)) {
    return schema.map(stripSchemaAnnotations);
  }
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (isAnnotation(key, value)) {
      continue;
    }
    if (DATA_KEYWORDS.has(key)) {
      out[key] = value;
    } else if (SCHEMA_MAPS.has(key)) {
      out[key] = stripMap(value);
    } else {
      out[key] = stripSchemaAnnotations(value);
    }
  }
  return out;
}
