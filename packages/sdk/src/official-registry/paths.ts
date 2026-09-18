import { OfficialRegistryError } from './error.js';
import type { Address, Caip10 } from './types.js';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const DEFAULT_OFFICIAL_REGISTRY_BASE_URL =
  'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry';

export const OFFICIAL_REGISTRY_REPO = 'ethereum/clear-signing-erc7730-registry';

export function normalizeAddress(address: string): Address {
  if (!ADDRESS_RE.test(address)) {
    throw new OfficialRegistryError(`Invalid address: ${address}`);
  }
  return address.toLowerCase() as Address;
}

export function toCaip10(chainId: number, address: string): Caip10 {
  if (!Number.isInteger(chainId) || chainId < 0) {
    throw new OfficialRegistryError(`Invalid chainId: ${chainId}`);
  }
  return `eip155:${chainId}:${normalizeAddress(address)}`;
}

export function registryFileUrl(baseUrl: string, pin: string, path: string): string {
  const prefix = baseUrl.replace(/\/+$/, '');
  return `${prefix}/${pin}/${path}`;
}

/**
 * Resolve an include URI against the including file's registry path.
 *
 * Remote (`https:`) includes are rejected here: the official client only loads
 * files from the pinned tree. ABI HTTP URLs stay out of scope (decode / #5).
 */
export function resolveRegistryPath(fromPath: string, ref: string): string {
  const trimmed = ref.trim();
  if (trimmed === '') {
    throw new OfficialRegistryError('Empty include path');
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    throw new OfficialRegistryError(`Remote include URIs are not fetched: ${trimmed}`);
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
        throw new OfficialRegistryError(`Include path escapes registry root: ${trimmed}`);
      }
      out.pop();
      continue;
    }
    out.push(part);
  }

  const resolved = out.join('/');
  if (!resolved) {
    throw new OfficialRegistryError(`Include path escapes registry root: ${trimmed}`);
  }
  return resolved;
}

export function assertSafeRegistryPath(path: string): void {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
    throw new OfficialRegistryError(`Unsafe registry path: ${path}`);
  }
}
