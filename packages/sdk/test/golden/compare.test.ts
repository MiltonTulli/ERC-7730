import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveDescriptor } from '../../src/resolve/index.js';
import {
  type GoldenCase,
  fileLoader,
  loadManifest,
  loadSnapshot,
  loadStagedDescriptor,
  projectResolved,
  stageCases,
  stagedBaseDir,
} from './harness.js';

const manifest = loadManifest();
let stageRoot: string;

beforeAll(() => {
  stageRoot = mkdtempSync(join(tmpdir(), 'erc7730-golden-sdk-'));
  stageCases(stageRoot, manifest);
});

afterAll(() => {
  if (stageRoot) {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

describe('golden python-erc7730 resolve', () => {
  it(`covers ${manifest.cases.length} official descriptors`, () => {
    expect(manifest.cases.length).toBeGreaterThanOrEqual(10);
    expect(manifest.pythonPackage).toMatch(/^erc7730==/);
  });

  it.each(manifest.cases)('$id matches the python resolved slice', async (item: GoldenCase) => {
    const snapshot = loadSnapshot(item.id);
    expect(snapshot.pythonPackage).toBe(manifest.pythonPackage);
    expect(snapshot.lint.errorTitles).toEqual([]);

    const input = loadStagedDescriptor(stageRoot, item);
    const resolved = await resolveDescriptor(input, fileLoader(stagedBaseDir(stageRoot, item)));
    const semantic = projectResolved(resolved.merged, item.kind);

    expect(semantic).toEqual(snapshot.semantic);
  });
});
