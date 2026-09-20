/**
 * Shared helpers for python-erc7730 golden tests.
 *
 * The comparable slice is documented in docs/divergences.md. Python's resolved
 * JSON is a firmware-oriented form (selectors, inlined constants, structured
 * paths). This projection keeps the overlap: deployments, format identity,
 * intent, and field path/label/format/visible.
 */

import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeclaration } from '../../src/decode/abi.js';
import type { IncludeLoader, InputDescriptor } from '../../src/types/descriptor.js';

export const SDK_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const GOLDEN_ROOT = dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_DIR = join(GOLDEN_ROOT, 'snapshots');
export const MANIFEST_PATH = join(GOLDEN_ROOT, 'manifest.json');

export type GoldenKind = 'calldata' | 'eip712';

export interface GoldenInclude {
  source: string;
  stageAs: string;
}

export interface GoldenCase {
  id: string;
  kind: GoldenKind;
  source: string;
  stageAs: string;
  includes?: GoldenInclude[];
}

export interface GoldenManifest {
  pythonPackage: string;
  cases: GoldenCase[];
}

export interface SemanticField {
  path: string | null;
  label: string | null;
  format: string | null;
  visible: unknown;
}

export interface SemanticFormat {
  id: string | null;
  intent: unknown;
  interpolatedIntent: unknown;
  fields: SemanticField[];
}

export interface SemanticResolved {
  kind: GoldenKind;
  schemaVersion: '2';
  id: unknown;
  owner: unknown;
  contractName: unknown;
  deployments: Array<{ chainId: number; address: string }>;
  domain: unknown;
  formats: Record<string, SemanticFormat>;
}

export interface GoldenSnapshot {
  id: string;
  pythonPackage: string;
  semantic: SemanticResolved;
  lint: { errorTitles: string[] };
}

export function loadManifest(): GoldenManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as GoldenManifest;
}

export function snapshotPath(id: string): string {
  return join(SNAPSHOT_DIR, `${id}.json`);
}

export function loadSnapshot(id: string): GoldenSnapshot {
  return JSON.parse(readFileSync(snapshotPath(id), 'utf8')) as GoldenSnapshot;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function stageCases(dest: string, manifest: GoldenManifest = loadManifest()): void {
  mkdirSync(dest, { recursive: true });
  for (const item of manifest.cases) {
    copyStaged(item.source, join(dest, item.stageAs));
    for (const include of item.includes ?? []) {
      copyStaged(include.source, join(dest, include.stageAs));
    }
  }
}

function copyStaged(relativeSource: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(SDK_ROOT, relativeSource), dest);
}

export function fileLoader(baseDir: string): IncludeLoader {
  const origins = new WeakMap<object, string>();
  return {
    async load(ref, from) {
      const fromPath = origins.get(from as object);
      const dir = fromPath ? dirname(fromPath) : baseDir;
      const resolved = join(dir, ref);
      const json: unknown = JSON.parse(readFileSync(resolved, 'utf8'));
      if (json && typeof json === 'object') {
        origins.set(json as object, resolved);
      }
      return json;
    },
  };
}

export function loadStagedDescriptor(stageRoot: string, item: GoldenCase): InputDescriptor {
  return JSON.parse(readFileSync(join(stageRoot, item.stageAs), 'utf8')) as InputDescriptor;
}

export function stagedBaseDir(stageRoot: string, item: GoldenCase): string {
  return dirname(join(stageRoot, item.stageAs));
}

/**
 * Map a calldata format key (ABI fragment or selector) to a 0x-prefixed 4-byte
 * selector. EIP-712 keys are left unchanged.
 */
export function formatIdentity(key: string, kind: GoldenKind): string {
  if (kind === 'eip712') {
    return key;
  }
  if (/^0x[0-9a-fA-F]{8}$/.test(key)) {
    return key.toLowerCase();
  }
  const parsed = parseDeclaration(key);
  if (!parsed) {
    throw new Error(`Cannot map format key to a selector: ${key}`);
  }
  return parsed.selector;
}

export function normalizePath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0) {
    return null;
  }
  if (path.startsWith('#.') || path.startsWith('$.') || path.startsWith('@.')) {
    return path;
  }
  return `#.${path}`;
}

function collectFields(fields: unknown): Record<string, unknown>[] {
  if (!Array.isArray(fields)) {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const field of fields) {
    if (!isPlainObject(field)) {
      continue;
    }
    if (Array.isArray(field.fields)) {
      out.push(...collectFields(field.fields));
      continue;
    }
    out.push(field);
  }
  return out;
}

function readDeployments(context: unknown): Array<{ chainId: number; address: string }> {
  if (!isPlainObject(context)) {
    return [];
  }
  const binding = isPlainObject(context.contract)
    ? context.contract
    : isPlainObject(context.eip712)
      ? context.eip712
      : undefined;
  if (!binding || !Array.isArray(binding.deployments)) {
    return [];
  }
  const deployments: Array<{ chainId: number; address: string }> = [];
  for (const item of binding.deployments) {
    if (!isPlainObject(item)) {
      continue;
    }
    if (typeof item.chainId !== 'number' || typeof item.address !== 'string') {
      continue;
    }
    deployments.push({
      chainId: item.chainId,
      address: item.address.toLowerCase(),
    });
  }
  return deployments;
}

function readDomain(context: unknown): unknown {
  if (!isPlainObject(context) || !isPlainObject(context.eip712)) {
    return undefined;
  }
  const domain = context.eip712.domain;
  if (!isPlainObject(domain)) {
    return domain ?? undefined;
  }
  const verifyingContract =
    typeof domain.verifyingContract === 'string'
      ? domain.verifyingContract.toLowerCase()
      : domain.verifyingContract;
  return { ...domain, verifyingContract };
}

/**
 * Project either SDK `merged` JSON or python-erc7730 resolved JSON onto the
 * comparable slice.
 */
export function projectResolved(doc: unknown, kind: GoldenKind): SemanticResolved {
  if (!isPlainObject(doc)) {
    throw new Error('Resolved descriptor is not an object');
  }
  const context = doc.context;
  const metadata = isPlainObject(doc.metadata) ? doc.metadata : {};
  const display = isPlainObject(doc.display) ? doc.display : {};
  const formatsIn = isPlainObject(display.formats) ? display.formats : {};
  const formats: Record<string, SemanticFormat> = {};

  for (const [key, format] of Object.entries(formatsIn)) {
    if (!isPlainObject(format)) {
      continue;
    }
    const identity = formatIdentity(key, kind);
    formats[identity] = {
      id: typeof format.$id === 'string' ? format.$id : null,
      intent: format.intent ?? null,
      interpolatedIntent: format.interpolatedIntent ?? null,
      fields: collectFields(format.fields).map((field) => ({
        path: normalizePath(field.path),
        label: typeof field.label === 'string' ? field.label : null,
        format: typeof field.format === 'string' ? field.format : null,
        visible: field.visible ?? null,
      })),
    };
  }

  const contextId = isPlainObject(context) ? context.$id : undefined;
  const formatsSorted: Record<string, SemanticFormat> = {};
  for (const key of Object.keys(formats).sort()) {
    const format = formats[key];
    if (format) {
      formatsSorted[key] = format;
    }
  }

  return {
    kind,
    schemaVersion: '2',
    id: contextId ?? null,
    owner: metadata.owner ?? null,
    contractName: metadata.contractName ?? null,
    deployments: readDeployments(context),
    domain: readDomain(context) ?? null,
    formats: formatsSorted,
  };
}

const GHA_LINE = /^::(?<level>error|warning|notice)(?:\s+(?<props>[^:]*))?::(?<message>[\s\S]*)$/;

export interface LintDiagnostic {
  level: 'error' | 'warning' | 'notice';
  title: string | null;
  message: string;
}

export function parseGithubAnnotations(output: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = GHA_LINE.exec(line);
    if (!match?.groups) {
      continue;
    }
    const props = match.groups.props ?? '';
    const titleMatch = /(?:^|,)title=([^,]*)/.exec(props);
    diagnostics.push({
      level: match.groups.level as LintDiagnostic['level'],
      title: titleMatch ? titleMatch[1] : null,
      message: match.groups.message.replace(/%0A/g, '\n'),
    });
  }
  return diagnostics;
}

export function lintErrorTitles(diagnostics: LintDiagnostic[]): string[] {
  return diagnostics
    .filter((item) => item.level === 'error')
    .map((item) => item.title ?? item.message.split('\n')[0] ?? 'error')
    .sort();
}

export function isNetworkLintFailure(diagnostics: LintDiagnostic[]): boolean {
  if (diagnostics.length === 0) {
    return false;
  }
  const errors = diagnostics.filter((item) => item.level === 'error');
  if (errors.length === 0) {
    return false;
  }
  return errors.every((item) =>
    /etherscan|sourcify|failed to fetch|connection|timeout|HTTP|network/i.test(
      `${item.title ?? ''} ${item.message}`
    )
  );
}
