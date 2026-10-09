#!/usr/bin/env node
/**
 * Write API Extractor reports for every public SDK entry.
 *
 * Chunk hashes in warning comments are normalized so a rebuild does not
 * churn the report when the public signatures stay the same.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sdkRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(sdkRoot, '../..');
const apiDir = join(repoRoot, 'api');
const tempDir = join(sdkRoot, 'temp');
const extractor = join(
  dirname(require.resolve('@microsoft/api-extractor/package.json')),
  'bin/api-extractor'
);
const base = JSON.parse(readFileSync(join(sdkRoot, 'api-extractor.json'), 'utf8'));

/** @type {Array<[string, string]>} */
const entries = [
  ['dist/index.d.ts', 'sdk.api.md'],
  ['dist/legacy.d.ts', 'sdk-legacy.api.md'],
  ['dist/attest.d.ts', 'sdk-attest.api.md'],
  ['dist/generate.d.ts', 'sdk-generate.api.md'],
  ['dist/sourcify.d.ts', 'sdk-sourcify.api.md'],
  ['dist/known-data.d.ts', 'sdk-known-data.api.md'],
];

mkdirSync(apiDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

let failed = false;
for (const [entry, reportFileName] of entries) {
  const config = {
    ...base,
    mainEntryPointFilePath: `<projectFolder>/${entry}`,
    apiReport: {
      ...base.apiReport,
      reportFileName,
      reportTempFolder: '<projectFolder>/temp',
    },
  };
  const configPath = join(tempDir, `${reportFileName}.json`);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const result = spawnSync(
    process.execPath,
    [extractor, 'run', '--local', '--config', configPath],
    { cwd: sdkRoot, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    failed = true;
    break;
  }
  const reportPath = join(apiDir, reportFileName);
  const normalized = readFileSync(reportPath, 'utf8').replace(
    /dist\/[A-Za-z0-9_.-]+-[A-Za-z0-9_]{6,}\.d\.ts/g,
    'dist/<chunk>.d.ts'
  );
  writeFileSync(reportPath, normalized.endsWith('\n') ? normalized : `${normalized}\n`);
}

rmSync(tempDir, { recursive: true, force: true });
if (failed) {
  process.exit(1);
}
