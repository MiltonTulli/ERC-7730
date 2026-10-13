// Performance thresholds for the built SDK (`packages/sdk/dist`). Run after `pnpm --filter @erc7730/sdk build`.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DECODE_OPTIONS,
  FORMAT_COUNT,
  TRANSFER_100_USDC,
  USDC,
  descriptorWithFormats,
  fixedRegistry,
} from './sdk-perf-fixtures.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = pathToFileURL(join(root, 'packages/sdk/dist/index.js')).href;

// Budgets carry headroom for shared CI runners; local runs are well below them.
const BUDGET_MS = {
  importSdk: 60,
  cachedDecode: 1,
  decode50Formats: 1,
};
const IMPORT_RUNS = 7;
const DECODE_WARMUP = 50;
const DECODE_RUNS = 500;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Cold import of the SDK's own modules. Third-party packages (ox, Ajv, viem) are
// loaded first so the number tracks work done by the SDK at import time.
const importProbe = `
const deps = ['ox/AbiParameters', 'ox/AbiEvent', 'ox/Hash', 'ox/Hex', 'ajv/dist/2020.js', 'ajv-formats', 'viem', 'viem/utils'];
await Promise.all(deps.map((dep) => import(dep)));
const start = performance.now();
await import(${JSON.stringify(entry)});
process.stdout.write(String(performance.now() - start));
`;

function importSdkMs() {
  const samples = [];
  for (let i = 0; i < IMPORT_RUNS; i++) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', importProbe], {
      cwd: join(root, 'packages/sdk'),
      encoding: 'utf8',
    });
    samples.push(Number(out));
  }
  return median(samples);
}

async function decodeMs(sdk, descriptor) {
  const resolved = await sdk.resolveDescriptor(descriptor);
  const options = { ...DECODE_OPTIONS, registry: fixedRegistry(resolved) };
  const tx = { to: USDC, data: TRANSFER_100_USDC, chainId: 1 };
  const first = await sdk.decodeTransaction(tx, options);
  if (first.functionName !== 'transfer') {
    throw new Error(`perf fixture decoded as ${first.functionName ?? first.source}`);
  }
  for (let i = 0; i < DECODE_WARMUP; i++) {
    await sdk.decodeTransaction(tx, options);
  }
  const samples = [];
  for (let i = 0; i < DECODE_RUNS; i++) {
    const start = performance.now();
    await sdk.decodeTransaction(tx, options);
    samples.push(performance.now() - start);
  }
  return median(samples);
}

const sdk = await import(entry);
const results = {
  importSdk: importSdkMs(),
  cachedDecode: await decodeMs(sdk, descriptorWithFormats(1)),
  decode50Formats: await decodeMs(sdk, descriptorWithFormats(FORMAT_COUNT)),
};

let failed = false;
for (const [name, ms] of Object.entries(results)) {
  const budget = BUDGET_MS[name];
  const ok = ms <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(16)} ${ms.toFixed(3)} ms (budget ${budget} ms)`
  );
}
if (failed) {
  process.exit(1);
}
