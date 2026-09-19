/**
 * Refresh or check python-erc7730 golden snapshots.
 *
 *   pnpm golden:python              # compare against committed snapshots
 *   pnpm golden:python -- --update  # rewrite snapshots
 *
 * Requires Python 3.12+ and `erc7730==1.0.11` on PATH
 * (`pip install erc7730==1.0.11` or `uvx --from erc7730==1.0.11 erc7730`).
 * Override the binary with ERC7730_BIN.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  type GoldenCase,
  type GoldenSnapshot,
  isNetworkLintFailure,
  lintErrorTitles,
  loadManifest,
  parseGithubAnnotations,
  projectResolved,
  snapshotPath,
  stageCases,
} from '../packages/sdk/test/golden/harness.ts';

const update = process.argv.includes('--update');
const manifest = loadManifest();
const pythonPackage = manifest.pythonPackage;

function findErc7730(): string {
  if (process.env.ERC7730_BIN) {
    return process.env.ERC7730_BIN;
  }
  const which = spawnSync('which', ['erc7730'], { encoding: 'utf8' });
  if (which.status === 0) {
    return which.stdout.trim();
  }
  const uvx = spawnSync('which', ['uvx'], { encoding: 'utf8' });
  if (uvx.status === 0) {
    return 'uvx';
  }
  throw new Error(
    `erc7730 CLI not found. Install ${pythonPackage} (Python 3.12+) or set ERC7730_BIN.\n` +
      `  pip install ${pythonPackage}\n` +
      `  uvx --from ${pythonPackage} erc7730 …`
  );
}

function runErc7730(
  bin: string,
  args: string[]
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const command =
    bin === 'uvx' ? ['uvx', '--from', pythonPackage, 'erc7730', ...args] : [bin, ...args];
  const result = spawnSync(command[0], command.slice(1), {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function resolveCase(bin: string, stageRoot: string, item: GoldenCase): unknown {
  const input = join(stageRoot, item.stageAs);
  const result = runErc7730(bin, ['resolve', '--v2', input]);
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0) {
    throw new Error(`erc7730 resolve failed for ${item.id} (exit ${result.status}):\n${output}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `erc7730 resolve for ${item.id} did not print JSON: ${
        error instanceof Error ? error.message : String(error)
      }\n${result.stdout}`
    );
  }
}

function lintCase(bin: string, stageRoot: string, item: GoldenCase): string[] {
  const input = join(stageRoot, item.stageAs);
  const result = runErc7730(bin, ['lint', '--v2', '--gha', input]);
  const output = `${result.stdout}\n${result.stderr}`;
  const diagnostics = parseGithubAnnotations(output);
  if (isNetworkLintFailure(diagnostics)) {
    console.warn(`skipping lint errors for ${item.id}: network-dependent ABI lookup failed`);
    return [];
  }
  const errors = lintErrorTitles(diagnostics);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`erc7730 lint crashed for ${item.id} (exit ${result.status}):\n${output}`);
  }
  if (errors.length > 0) {
    throw new Error(
      `erc7730 lint reported errors for ${item.id} (not snapshotted as known diffs):\n${errors.join('\n')}`
    );
  }
  return errors;
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const bin = findErc7730();
const version = runErc7730(bin, ['--help']);
if (version.status !== 0) {
  throw new Error(`Could not execute erc7730 (${bin}):\n${version.stderr}`);
}

const stageRoot = mkdtempSync(join(tmpdir(), 'erc7730-golden-py-'));
let failures = 0;

try {
  stageCases(stageRoot, manifest);
  mkdirSync(dirname(snapshotPath(manifest.cases[0].id)), { recursive: true });

  for (const item of manifest.cases) {
    const pythonResolved = resolveCase(bin, stageRoot, item);
    const snapshot: GoldenSnapshot = {
      id: item.id,
      pythonPackage,
      semantic: projectResolved(pythonResolved, item.kind),
      lint: { errorTitles: lintCase(bin, stageRoot, item) },
    };
    const encoded = stableStringify(snapshot);
    const dest = snapshotPath(item.id);

    if (update) {
      writeFileSync(dest, encoded);
      console.log(`updated ${item.id}`);
      continue;
    }

    let current: string;
    try {
      current = readFileSync(dest, 'utf8');
    } catch {
      console.error(`missing snapshot for ${item.id}; run pnpm golden:python -- --update`);
      failures += 1;
      continue;
    }
    if (current !== encoded) {
      console.error(`snapshot drift: ${item.id}`);
      failures += 1;
    } else {
      console.log(`ok ${item.id}`);
    }
  }
} finally {
  rmSync(stageRoot, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(
    `${failures} golden snapshot(s) differ. Re-run with --update after reviewing docs/divergences.md.`
  );
  process.exit(1);
}

console.log(
  update
    ? `Wrote ${manifest.cases.length} snapshots from ${pythonPackage}.`
    : `Checked ${manifest.cases.length} snapshots against ${pythonPackage}.`
);
