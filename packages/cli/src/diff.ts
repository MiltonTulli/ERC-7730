import { isDeepStrictEqual, parseArgs } from 'node:util';
import {
  type InputDescriptor,
  type OfficialRegistry,
  type ResolvedDescriptor,
  resolveDescriptor,
} from '@erc7730/sdk';
import {
  asInputDescriptor,
  createFsIncludeLoader,
  parseAddress,
  readJsonFile,
  resolvePath,
} from './fsjson.js';
import { DIFF_HELP } from './help.js';
import { openRegistry, resolvePin } from './registry.js';
import type { CliContext, CliResult } from './types.js';
import { UsageError } from './types.js';

interface FieldSlice {
  path?: unknown;
  label?: unknown;
  format?: unknown;
  visible?: unknown;
}

interface FormatSlice {
  key: string;
  intent?: unknown;
  interpolatedIntent?: unknown;
  fields: FieldSlice[];
}

function flattenFields(items: unknown, acc: FieldSlice[]): void {
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (Array.isArray(rec.fields)) {
      flattenFields(rec.fields, acc);
      continue;
    }
    acc.push({
      path: rec.path,
      label: rec.label,
      format: rec.format,
      visible: rec.visible,
    });
  }
}

function sliceFormats(descriptor: InputDescriptor): FormatSlice[] {
  const display = descriptor.display;
  if (!display || typeof display !== 'object') {
    return [];
  }
  const formats = (display as { formats?: unknown }).formats;
  if (!formats || typeof formats !== 'object') {
    return [];
  }
  const out: FormatSlice[] = [];
  for (const [key, format] of Object.entries(formats as Record<string, unknown>)) {
    if (!format || typeof format !== 'object') {
      out.push({ key, fields: [] });
      continue;
    }
    const rec = format as Record<string, unknown>;
    const fields: FieldSlice[] = [];
    flattenFields(rec.fields, fields);
    out.push({
      key,
      intent: rec.intent,
      interpolatedIntent: rec.interpolatedIntent,
      fields,
    });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

function bindingKind(descriptor: InputDescriptor): 'calldata' | 'eip712' {
  const context = descriptor.context;
  if (context && typeof context === 'object' && 'eip712' in context) {
    return 'eip712';
  }
  return 'calldata';
}

async function lookupOfficial(
  registry: OfficialRegistry,
  resolved: ResolvedDescriptor
): Promise<{ hits: ResolvedDescriptor[]; misses: string[] }> {
  const kind = bindingKind(resolved.merged);
  const hits: ResolvedDescriptor[] = [];
  const seen = new Set<string>();
  const misses: string[] = [];

  for (const deployment of resolved.deployments) {
    const address = parseAddress(deployment.address, 'deployment.address');
    const caip = `eip155:${deployment.chainId}:${address.toLowerCase()}`;
    const key = { chainId: deployment.chainId, address };
    const hit =
      kind === 'eip712' ? await registry.findEip712(key) : await registry.findCalldata(key);
    if (!hit) {
      misses.push(caip);
      continue;
    }
    if (!seen.has(hit.hash)) {
      seen.add(hit.hash);
      hits.push(hit);
    }
  }

  return { hits, misses };
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(a, b);
}

function diffSlices(local: FormatSlice[], official: FormatSlice[]): string[] {
  const lines: string[] = [];
  const officialByKey = new Map(official.map((item) => [item.key, item]));
  const localKeys = new Set(local.map((item) => item.key));

  for (const item of local) {
    const other = officialByKey.get(item.key);
    if (!other) {
      lines.push(`+ ${item.key} (local only)`);
      continue;
    }
    if (!jsonEqual(item.intent, other.intent)) {
      lines.push(`~ ${item.key}.intent`);
      lines.push(`    local:    ${JSON.stringify(item.intent)}`);
      lines.push(`    official: ${JSON.stringify(other.intent)}`);
    }
    if (!jsonEqual(item.interpolatedIntent, other.interpolatedIntent)) {
      lines.push(`~ ${item.key}.interpolatedIntent`);
      lines.push(`    local:    ${JSON.stringify(item.interpolatedIntent)}`);
      lines.push(`    official: ${JSON.stringify(other.interpolatedIntent)}`);
    }
    if (!jsonEqual(item.fields, other.fields)) {
      lines.push(`~ ${item.key}.fields`);
      lines.push(`    local:    ${JSON.stringify(item.fields)}`);
      lines.push(`    official: ${JSON.stringify(other.fields)}`);
    }
  }

  for (const item of official) {
    if (!localKeys.has(item.key)) {
      lines.push(`- ${item.key} (official only)`);
    }
  }
  return lines;
}

export async function runDiff(args: string[], ctx: CliContext): Promise<CliResult> {
  let values: {
    help?: boolean;
    against?: string;
    pin?: string;
    'registry-path'?: string;
  };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        against: { type: 'string' },
        pin: { type: 'string' },
        'registry-path': { type: 'string' },
      },
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), DIFF_HELP);
  }

  if (values.help) {
    ctx.out.println(DIFF_HELP);
    return ctx.out.result(0);
  }
  if (positionals.length !== 1) {
    throw new UsageError('diff requires exactly one descriptor file', DIFF_HELP);
  }
  const against = values.against ?? 'official';
  if (against !== 'official') {
    throw new UsageError(`--against ${against} is not supported (use "official")`, DIFF_HELP);
  }

  const file = resolvePath(ctx.io.cwd, positionals[0]);
  const input = asInputDescriptor(await readJsonFile(file), positionals[0]);
  const local = await resolveDescriptor(input, createFsIncludeLoader(file));

  const pin = resolvePin(values.pin, ctx.io.env);
  const registry = await openRegistry(ctx, {
    pin,
    registryPath: values['registry-path'],
  });
  const { hits, misses } = await lookupOfficial(registry, local);
  if (hits.length === 0) {
    ctx.out.eprintln(
      `No official descriptor for ${local.deployments
        .map((d) => `eip155:${d.chainId}:${d.address}`)
        .join(', ')} at pin ${pin}`
    );
    return ctx.out.result(1);
  }
  if (hits.length > 1) {
    ctx.out.eprintln(
      `Deployments resolved to ${hits.length} distinct official descriptors at pin ${pin}`
    );
    return ctx.out.result(1);
  }

  const official = hits[0];
  const lines = diffSlices(sliceFormats(local.merged), sliceFormats(official.merged));
  ctx.out.println(`local:    ${positionals[0]}`);
  ctx.out.println(`official: pin ${pin}  hash ${official.hash}`);
  for (const miss of misses) {
    ctx.out.eprintln(`No official descriptor for ${miss} at pin ${pin}`);
  }
  if (lines.length === 0 && misses.length === 0) {
    ctx.out.println('No differences in intent / fields.');
    return ctx.out.result(0);
  }
  for (const line of lines) {
    ctx.out.println(line);
  }
  return ctx.out.result(1);
}
