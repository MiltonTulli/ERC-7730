import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import type { IncludeLoader, InputDescriptor } from '@erc7730/sdk';
import { ADDRESS_RE, UsageError } from './types.js';

export function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

export async function readJsonFile(path: string): Promise<unknown> {
  const text = await readTextFile(path);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(`${path}: invalid JSON (${message})`);
  }
}

export function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function collectJsonFiles(root: string): Promise<string[]> {
  const info = await stat(root);
  if (info.isFile()) {
    return [root];
  }
  if (!info.isDirectory()) {
    return [];
  }
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectJsonFiles(full)));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
      out.push(full);
    }
  }
  out.sort();
  return out;
}

export function parseAddress(value: string, flag: string): `0x${string}` {
  if (!ADDRESS_RE.test(value)) {
    throw new UsageError(`${flag} must be a 0x-prefixed 20-byte address`);
  }
  return value as `0x${string}`;
}

export function parseChainId(value: string | undefined, flag = '--chain-id'): number {
  if (value === undefined || value === '') {
    throw new UsageError(`${flag} is required`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new UsageError(`${flag} must be a non-negative integer`);
  }
  return n;
}

export function asInputDescriptor(value: unknown, path: string): InputDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageError(`${path}: descriptor must be a JSON object`);
  }
  return value as InputDescriptor;
}

/**
 * Filesystem include loader. Relative `includes` are resolved from the
 * starting file (resolveDescriptor clones the input, so nested identity is
 * not preserved — same fallback as the official registry client).
 */
export function createFsIncludeLoader(startPath: string): IncludeLoader {
  return {
    async load(ref: string) {
      const trimmed = ref.trim();
      if (trimmed === '') {
        throw new Error('Empty include path');
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
        throw new Error(`Remote include URIs are not fetched: ${trimmed}`);
      }
      const resolved = resolve(dirname(startPath), trimmed);
      const json = JSON.parse(await readFile(resolved, 'utf8')) as unknown;
      return json;
    },
  };
}

export function resolveIncludePath(fromPath: string, ref: string): string {
  const trimmed = ref.trim();
  if (trimmed === '' || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    throw new Error(`Cannot follow include: ${ref}`);
  }
  const fromDir = fromPath.split('/').slice(0, -1);
  const parts = [...fromDir, ...trimmed.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      if (out.length === 0) {
        throw new Error(`Include path escapes registry root: ${trimmed}`);
      }
      out.pop();
      continue;
    }
    out.push(part);
  }
  const resolved = out.join('/');
  if (!resolved) {
    throw new Error(`Include path escapes registry root: ${trimmed}`);
  }
  return resolved;
}
