import { homedir as osHomedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type OfficialRegistry,
  VENDORED_REGISTRY_COMMIT,
  createOfficialRegistry,
  isCommitSha,
} from '@erc7730/sdk';
import { pathExists, readJsonFile, resolveIncludePath, writeTextFile } from './fsjson.js';
import { REGISTRY_HELP } from './help.js';
import type { CliContext, CliResult } from './types.js';
import { PIN_RE, UsageError } from './types.js';

const CALLDATA_INDEX = 'index.calldata.json';
const EIP712_INDEX = 'index.eip712.json';
const DEFAULT_BASE = 'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry';

export function cacheRoot(ctx: CliContext, cacheDirFlag?: string): string {
  if (cacheDirFlag) {
    return cacheDirFlag;
  }
  if (ctx.io.env.ERC7730_CACHE_DIR) {
    return ctx.io.env.ERC7730_CACHE_DIR;
  }
  const home = ctx.io.homedir || osHomedir();
  return join(home, '.erc7730');
}

export function pinDir(root: string, pin: string): string {
  return join(root, 'registry', pin);
}

export function resolvePin(flag: string | undefined, env: NodeJS.ProcessEnv): string {
  const value = (flag ?? env.ERC7730_REGISTRY_PIN ?? VENDORED_REGISTRY_COMMIT).trim();
  if (!isCommitSha(value) || !PIN_RE.test(value)) {
    throw new UsageError(
      'pin must be a 40-character git commit SHA (refusing master/main). Pass --pin or ERC7730_REGISTRY_PIN'
    );
  }
  return value.toLowerCase();
}

function pathFromRegistryUrl(url: string, pin: string): string | null {
  const marker = `/${pin}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) {
    return null;
  }
  return url.slice(idx + marker.length);
}

export function filesystemFetch(root: string, pin: string): typeof fetch {
  return async (input) => {
    const url = String(input);
    const path = pathFromRegistryUrl(url, pin);
    if (!path) {
      return new Response('not found', { status: 404 });
    }
    const file = join(root, path);
    try {
      const json = await readJsonFile(file);
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  };
}

export async function resolveRegistryTree(
  ctx: CliContext,
  options: { pin: string; registryPath?: string; cacheDir?: string }
): Promise<{ pin: string; tree?: string }> {
  const explicit = options.registryPath ?? ctx.io.env.ERC7730_REGISTRY_PATH;
  if (explicit) {
    return { pin: options.pin, tree: explicit };
  }
  const cached = pinDir(cacheRoot(ctx, options.cacheDir), options.pin);
  if (await pathExists(join(cached, CALLDATA_INDEX))) {
    return { pin: options.pin, tree: cached };
  }
  return { pin: options.pin };
}

export async function openRegistry(
  ctx: CliContext,
  options: { pin: string; registryPath?: string; cacheDir?: string }
): Promise<OfficialRegistry> {
  const resolved = await resolveRegistryTree(ctx, options);
  if (resolved.tree) {
    return createOfficialRegistry({
      pin: resolved.pin,
      fetch: filesystemFetch(resolved.tree, resolved.pin),
    });
  }
  return createOfficialRegistry({
    pin: resolved.pin,
    fetch: ctx.io.fetch,
  });
}

function isRegistryJsonPath(value: string): boolean {
  if (!value.endsWith('.json') || value.includes('://') || value.startsWith('/')) {
    return false;
  }
  return !value.split('/').includes('..');
}

function collectJsonPaths(value: unknown, acc: Set<string>): void {
  if (typeof value === 'string' && isRegistryJsonPath(value)) {
    acc.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonPaths(item, acc);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectJsonPaths(item, acc);
    }
  }
}

async function fetchRegistryJson(
  fetchImpl: typeof fetch,
  pin: string,
  path: string
): Promise<unknown> {
  const url = `${DEFAULT_BASE}/${pin}/${path}`;
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch ${path}: ${message}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status}) from pin ${pin}`);
  }
  return (await response.json()) as unknown;
}

function includeRef(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const includes = (value as { includes?: unknown }).includes;
  return typeof includes === 'string' ? includes : undefined;
}

export async function updateRegistry(
  ctx: CliContext,
  options: { pin: string; cacheDir?: string }
): Promise<{ dir: string; files: number }> {
  const dir = pinDir(cacheRoot(ctx, options.cacheDir), options.pin);
  const pending = [CALLDATA_INDEX, EIP712_INDEX];
  const seen = new Set<string>();
  let files = 0;

  while (pending.length > 0) {
    const path = pending.shift();
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    const json = await fetchRegistryJson(ctx.io.fetch, options.pin, path);
    await writeTextFile(join(dir, path), `${JSON.stringify(json, null, 2)}\n`);
    files += 1;

    const more = new Set<string>();
    collectJsonPaths(json, more);
    const include = includeRef(json);
    if (include) {
      more.add(resolveIncludePath(path, include));
    }
    for (const next of more) {
      if (!seen.has(next) && next !== path) {
        pending.push(next);
      }
    }
  }

  return { dir, files };
}

export async function runRegistry(args: string[], ctx: CliContext): Promise<CliResult> {
  const [sub, ...rest] = args;
  if (!sub || sub === '-h' || sub === '--help') {
    ctx.out.println(REGISTRY_HELP);
    return ctx.out.result(sub ? 0 : 1);
  }
  if (sub !== 'update') {
    throw new UsageError(`Unknown registry command: ${sub}`, REGISTRY_HELP);
  }

  let values: { help?: boolean; pin?: string; 'cache-dir'?: string };
  try {
    values = parseArgs({
      args: rest,
      options: {
        help: { type: 'boolean', short: 'h' },
        pin: { type: 'string' },
        'cache-dir': { type: 'string' },
      },
    }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), REGISTRY_HELP);
  }

  if (values.help) {
    ctx.out.println(REGISTRY_HELP);
    return ctx.out.result(0);
  }

  const pin = resolvePin(values.pin, ctx.io.env);
  const result = await updateRegistry(ctx, {
    pin,
    cacheDir: values['cache-dir'],
  });
  ctx.out.println(`Updated ${result.dir}`);
  ctx.out.println(`  ${result.files} file(s) from pin ${pin}`);
  return ctx.out.result(0);
}
