import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeTransaction } from '../../src/decode/decodeTransaction';
import { decodeTypedData } from '../../src/decode/decodeTypedData';
import { resolveDescriptor } from '../../src/resolve';
import { renderScreensText, toScreens } from '../../src/screens';
import {
  GOLDEN_ROOT,
  type GoldenCase,
  fileLoader,
  loadManifest,
  loadStagedDescriptor,
  stageCases,
  stagedBaseDir,
} from './harness';
import { renderGoldenScreen } from './renderCase';

const manifest = loadManifest();
const update = process.env.UPDATE_SCREENS === '1';

let stageRoot: string;

beforeAll(() => {
  stageRoot = mkdtempSync(join(tmpdir(), 'erc7730-screens-'));
  stageCases(stageRoot, manifest);
});

afterAll(() => {
  if (stageRoot) {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

async function renderCase(item: GoldenCase): Promise<string> {
  const input = loadStagedDescriptor(stageRoot, item);
  return renderGoldenScreen(item, input, fileLoader(stagedBaseDir(stageRoot, item)), {
    resolveDescriptor,
    decodeTransaction,
    decodeTypedData,
    renderScreensText,
    toScreens,
  });
}

describe('screen goldens', () => {
  it.each(manifest.cases)('$id matches the committed screen text', async (item: GoldenCase) => {
    const actual = await renderCase(item);
    const path = join(GOLDEN_ROOT, 'screens', `${item.id}.txt`);
    if (update) {
      writeFileSync(path, actual);
    }
    const expected = readFileSync(path, 'utf8');
    expect(actual).toBe(expected);
  });
});
