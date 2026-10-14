import { appendFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type DecodedOperation,
  type ExternalDataProvider,
  type Hex,
  type TypedDataInput,
  createOfficialRegistry,
  decodeTransaction,
  decodeTypedData,
  officialOrLocalPolicy,
  renderScreensText,
  resolveDescriptor,
  toScreens,
  validateDescriptorTests,
} from '@erc7730/sdk';
import { parseTransaction, toFunctionSelector } from 'viem';
import {
  asInputDescriptor,
  createFsIncludeLoader,
  parseAddress,
  readJsonFile,
  readTextFile,
  resolvePath,
} from './fsjson';
import { TEST_HELP } from './help';
import type { CliContext, CliResult } from './types';
import { UsageError } from './types';

interface RenderedField {
  label: string;
  value: string | RenderedOutput;
}

interface RenderedOutput {
  intent: string;
  interpolatedIntent?: string;
  owner?: string;
  fields: RenderedField[];
}

interface CaseReport {
  description: string;
  status: 'pass' | 'fail' | 'error';
  screen?: string;
  message?: string;
  diff?: string;
  line: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function companionTests(descriptorPath: string): string {
  const base = basename(descriptorPath).replace(/\.json$/i, '');
  return join(dirname(descriptorPath), 'testsv2', `${base}.tests.json`);
}

function displayFormats(merged: unknown): Record<string, unknown> | undefined {
  if (!isRecord(merged)) {
    return undefined;
  }
  const display = merged.display;
  if (!isRecord(display) || !isRecord(display.formats)) {
    return undefined;
  }
  return display.formats;
}

function stringIntent(intent: unknown): string | undefined {
  if (typeof intent === 'string' && intent.length > 0) {
    return intent;
  }
  if (!isRecord(intent)) {
    return undefined;
  }
  if (typeof intent.en === 'string' && intent.en.length > 0) {
    return intent.en;
  }
  for (const value of Object.values(intent)) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function selectorOfKey(key: string): string | undefined {
  const trimmed = key.trim();
  if (/^0x[0-9a-fA-F]{8}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  try {
    return toFunctionSelector(trimmed).toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * testsv2 `expected.intent` is the descriptor literal. A filled template stores
 * that sentence in `operation.intent` as well as `interpolatedIntent`.
 */
function literalIntent(merged: unknown, operation: DecodedOperation): string | undefined {
  const formats = displayFormats(merged);
  if (!formats) {
    return undefined;
  }
  const selector = operation.selector?.toLowerCase();
  for (const [key, value] of Object.entries(formats)) {
    if (!isRecord(value)) {
      continue;
    }
    const matched = selector
      ? selectorOfKey(key) === selector
      : operation.signature !== undefined && key === operation.signature;
    if (!matched) {
      continue;
    }
    const intent = stringIntent(value.intent);
    if (intent) {
      return intent;
    }
  }
  return undefined;
}

function renderOperation(operation: DecodedOperation, merged: unknown): RenderedOutput {
  const rendered: RenderedOutput = {
    intent: literalIntent(merged, operation) ?? operation.intent,
    fields: operation.fields
      .filter((field) => !field.hidden)
      .map((field) => ({
        label: field.label,
        value:
          field.format === 'calldata' && field.details.embedded
            ? renderOperation(field.details.embedded, merged)
            : field.value,
      })),
  };
  if (operation.interpolatedIntent !== undefined) {
    rendered.interpolatedIntent = operation.interpolatedIntent;
  }
  if (operation.metadata.owner !== undefined) {
    rendered.owner = operation.metadata.owner;
  }
  return rendered;
}

function mismatch(path: string, expected: unknown, actual: unknown): string {
  return `${path} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}

function compareValue(
  actual: RenderedField['value'],
  expected: RenderedField['value'],
  path: string
): string | undefined {
  const actualObject = typeof actual === 'object' && actual !== null;
  const expectedObject = typeof expected === 'object' && expected !== null;
  if (actualObject !== expectedObject) {
    return mismatch(path, expected, actual);
  }
  if (actualObject && expectedObject) {
    return compareRendered(actual, expected, path);
  }
  if (actual !== expected) {
    return mismatch(path, expected, actual);
  }
  return undefined;
}

function compareFields(
  actual: RenderedField[],
  expected: RenderedField[],
  path: string
): string | undefined {
  if (actual.length !== expected.length) {
    return `${path}: length mismatch — expected ${expected.length} entries, got ${actual.length}`;
  }
  for (let i = 0; i < expected.length; i++) {
    const left = actual[i];
    const right = expected[i];
    if (!left || !right) {
      return `${path}: length mismatch — expected ${expected.length} entries, got ${actual.length}`;
    }
    if (left.label !== right.label) {
      return mismatch(`${path}[${i}].label`, right.label, left.label);
    }
    const value = compareValue(left.value, right.value, `${path}[${i}].value`);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function compareRendered(
  actual: RenderedOutput,
  expected: RenderedOutput,
  path = ''
): string | undefined {
  const prefix = path === '' ? '' : `${path}.`;
  if (actual.intent !== expected.intent) {
    return mismatch(`${prefix}intent`, expected.intent, actual.intent);
  }
  if (actual.interpolatedIntent !== expected.interpolatedIntent) {
    return mismatch(
      `${prefix}interpolatedIntent`,
      expected.interpolatedIntent,
      actual.interpolatedIntent
    );
  }
  if (actual.owner !== expected.owner) {
    return mismatch(`${prefix}owner`, expected.owner, actual.owner);
  }
  return compareFields(actual.fields, expected.fields, `${prefix}fields`);
}

function unifiedDiff(expected: string, actual: string): string {
  const left = expected.split('\n');
  const right = actual.split('\n');
  const rows = left.length;
  const cols = right.length;
  const scores: number[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    const row = scores[i];
    const next = scores[i + 1];
    if (!row || !next) {
      continue;
    }
    for (let j = cols - 1; j >= 0; j--) {
      row[j] =
        left[i] === right[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const lines = ['--- expected', '+++ actual'];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (left[i] === right[j]) {
      lines.push(` ${left[i]}`);
      i += 1;
      j += 1;
      continue;
    }
    const down = scores[i + 1]?.[j] ?? 0;
    const across = scores[i]?.[j + 1] ?? 0;
    if (down >= across) {
      lines.push(`-${left[i]}`);
      i += 1;
    } else {
      lines.push(`+${right[j]}`);
      j += 1;
    }
  }
  while (i < rows) {
    lines.push(`-${left[i]}`);
    i += 1;
  }
  while (j < cols) {
    lines.push(`+${right[j]}`);
    j += 1;
  }
  return lines.join('\n');
}

function asRendered(value: unknown): RenderedOutput | undefined {
  if (!isRecord(value) || typeof value.intent !== 'string' || !Array.isArray(value.fields)) {
    return undefined;
  }
  const fields: RenderedField[] = [];
  for (const field of value.fields) {
    if (!isRecord(field) || typeof field.label !== 'string') {
      return undefined;
    }
    if (typeof field.value === 'string') {
      fields.push({ label: field.label, value: field.value });
      continue;
    }
    const nested = asRendered(field.value);
    if (!nested) {
      return undefined;
    }
    fields.push({ label: field.label, value: nested });
  }
  const rendered: RenderedOutput = { intent: value.intent, fields };
  if (typeof value.interpolatedIntent === 'string') {
    rendered.interpolatedIntent = value.interpolatedIntent;
  }
  if (typeof value.owner === 'string') {
    rendered.owner = value.owner;
  }
  return rendered;
}

function lineOf(text: string, description: string): number {
  const quoted = JSON.stringify(description);
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const keyAt = line.indexOf('"description"');
    if (keyAt === -1) {
      continue;
    }
    const colon = line.indexOf(':', keyAt + '"description"'.length);
    if (colon === -1) {
      continue;
    }
    let value = line.slice(colon + 1).trim();
    if (value.endsWith(',')) {
      value = value.slice(0, -1).trim();
    }
    if (value === quoted) {
      return index + 1;
    }
  }
  return 1;
}

function dataProviderOf(value: unknown): ExternalDataProvider {
  const block = isRecord(value) ? value : {};
  const tokens = lowercaseRecords(block.tokens);
  const localNames = lowercaseStrings(block.addressNames);
  const ensNames = lowercaseStrings(block.ensNames);
  const nftNames = lowercaseStrings(block.nftCollectionNames);
  const timestamps = isRecord(block.blockTimestamps) ? block.blockTimestamps : {};
  return {
    async resolveToken(_chainId, address) {
      const meta = tokens[address.toLowerCase()];
      if (!isRecord(meta) || typeof meta.symbol !== 'string' || typeof meta.decimals !== 'number') {
        return null;
      }
      return {
        symbol: meta.symbol,
        decimals: meta.decimals,
        ...(typeof meta.name === 'string' ? { name: meta.name } : {}),
      };
    },
    async resolveLocalName(address) {
      return localNames[address.toLowerCase()] ?? null;
    },
    async resolveEnsName(address) {
      return ensNames[address.toLowerCase()] ?? null;
    },
    async resolveNftCollectionName(_chainId, address) {
      return nftNames[address.toLowerCase()] ?? null;
    },
    async resolveBlockTimestamp(_chainId, blockHeight) {
      const stamp = timestamps[blockHeight.toString()];
      return typeof stamp === 'number' ? stamp : null;
    },
  };
}

function lowercaseRecords(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key.toLowerCase()] = entry;
  }
  return out;
}

function lowercaseStrings(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      out[key.toLowerCase()] = entry;
    }
  }
  return out;
}

function screenOf(operation: DecodedOperation): string {
  return renderScreensText(toScreens(operation));
}

async function runCalldataCase(
  raw: Record<string, unknown>,
  options: Parameters<typeof decodeTransaction>[1]
): Promise<{ operation?: DecodedOperation; error?: string }> {
  if (typeof raw.rawTx !== 'string') {
    return { error: 'Calldata case is missing rawTx' };
  }
  let parsed: ReturnType<typeof parseTransaction>;
  try {
    parsed = parseTransaction(raw.rawTx as Hex);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (!parsed.to) {
    return { error: 'Transaction has no to address' };
  }
  if (parsed.chainId === undefined) {
    return { error: 'Transaction has no chainId' };
  }
  const from = typeof raw.from === 'string' ? parseAddress(raw.from, 'from') : undefined;
  try {
    const operation = await decodeTransaction(
      {
        chainId: Number(parsed.chainId),
        to: parsed.to,
        data: parsed.data ?? '0x',
        value: parsed.value ?? 0n,
        ...(from ? { from } : {}),
      },
      options
    );
    return { operation };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function typedDataOf(value: unknown): TypedDataInput | undefined {
  if (!isRecord(value) || !isRecord(value.domain) || !isRecord(value.types)) {
    return undefined;
  }
  if (typeof value.primaryType !== 'string' || !isRecord(value.message)) {
    return undefined;
  }
  return value as unknown as TypedDataInput;
}

async function runTypedCase(
  raw: Record<string, unknown>,
  options: Parameters<typeof decodeTypedData>[1]
): Promise<{ operation?: DecodedOperation; error?: string }> {
  const data = typedDataOf(raw.data);
  if (!data) {
    return { error: 'EIP-712 case is missing data' };
  }
  try {
    return { operation: await decodeTypedData(data, options) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function reportCase(
  description: string,
  line: number,
  outcome: { operation?: DecodedOperation; error?: string },
  expected: RenderedOutput | undefined,
  merged: unknown
): CaseReport {
  if (!outcome.operation) {
    return { description, status: 'error', line, message: outcome.error ?? 'Case failed' };
  }
  const screen = screenOf(outcome.operation);
  if (!expected) {
    return { description, status: 'pass', line, screen };
  }
  const actual = renderOperation(outcome.operation, merged);
  const message = compareRendered(actual, expected);
  if (!message) {
    return { description, status: 'pass', line, screen };
  }
  return {
    description,
    status: 'fail',
    line,
    screen,
    message,
    diff: unifiedDiff(JSON.stringify(expected, null, 2), JSON.stringify(actual, null, 2)),
  };
}

function annotationFile(cwd: string, file: string): string {
  const rel = relative(cwd, file);
  return rel.startsWith('..') || rel === '' ? file : rel;
}

function workflowProperty(value: string): string {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(',', '%2C')
    .replaceAll(':', '%3A');
}

function workflowMessage(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function markdownSummary(reports: CaseReport[], descriptorPath: string): string {
  const lines = ['## erc7730 test', '', `\`${descriptorPath}\``, ''];
  for (const report of reports) {
    lines.push(`### ${report.description}`, '');
    lines.push(`**${report.status}**`, '');
    if (report.screen) {
      lines.push('```text', report.screen, '```', '');
    }
    if (report.message) {
      lines.push(report.message, '');
    }
    if (report.diff) {
      lines.push('```diff', report.diff, '```', '');
    }
  }
  const passed = reports.filter((report) => report.status === 'pass').length;
  const failed = reports.length - passed;
  lines.push(`${passed} passed, ${failed} failed`, '');
  return lines.join('\n');
}

function printText(ctx: CliContext, reports: CaseReport[]): void {
  for (const report of reports) {
    ctx.out.println(report.description);
    if (report.screen) {
      ctx.out.println(report.screen);
    }
    ctx.out.println(report.status);
    if (report.message) {
      ctx.out.println(report.message);
    }
    if (report.diff) {
      ctx.out.println(report.diff);
    }
    ctx.out.println('');
  }
  const passed = reports.filter((report) => report.status === 'pass').length;
  ctx.out.println(`${passed} passed, ${reports.length - passed} failed`);
}

async function printGithub(
  ctx: CliContext,
  reports: CaseReport[],
  testsPath: string,
  descriptorPath: string
): Promise<void> {
  const file = annotationFile(ctx.io.cwd, testsPath);
  for (const report of reports) {
    if (report.status === 'pass') {
      continue;
    }
    const message = report.message ?? report.status;
    ctx.out.println(
      `::error file=${workflowProperty(file)},line=${report.line}::${workflowMessage(`${report.description}: ${message}`)}`
    );
  }
  const summary = markdownSummary(reports, annotationFile(ctx.io.cwd, descriptorPath));
  ctx.out.println(summary);
  const target = ctx.io.env.GITHUB_STEP_SUMMARY;
  if (target) {
    await appendFile(target, summary);
  }
}

export async function runTest(args: string[], ctx: CliContext): Promise<CliResult> {
  let values: { help?: boolean; tests?: string; reporter?: string };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        tests: { type: 'string' },
        reporter: { type: 'string' },
      },
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), TEST_HELP);
  }

  if (values.help) {
    ctx.out.println(TEST_HELP);
    return ctx.out.result(0);
  }

  const reporter = values.reporter ?? 'text';
  if (reporter !== 'text' && reporter !== 'github') {
    throw new UsageError('--reporter must be text or github', TEST_HELP);
  }
  const descriptorArg = positionals[0];
  if (!descriptorArg || positionals.length > 1) {
    throw new UsageError('test requires one descriptor path', TEST_HELP);
  }

  const descriptorPath = resolvePath(ctx.io.cwd, descriptorArg);
  const testsPath = resolvePath(ctx.io.cwd, values.tests ?? companionTests(descriptorArg));
  const testsText = await readTextFile(testsPath);
  const document = await readJsonFile(testsPath);
  const validated = validateDescriptorTests(document);
  if (!validated.ok) {
    ctx.out.println(`${testsPath}: invalid testsv2 file`);
    for (const error of validated.errors) {
      ctx.out.println(`  ${error.path}  ${error.message}`);
    }
    return ctx.out.result(1);
  }
  if (!isRecord(document) || !Array.isArray(document.tests)) {
    throw new UsageError(`${testsPath}: invalid testsv2 file`, TEST_HELP);
  }

  const input = asInputDescriptor(await readJsonFile(descriptorPath), descriptorPath);
  const resolved = await resolveDescriptor(input, createFsIncludeLoader(descriptorPath));
  const registry = createOfficialRegistry({ fetch: ctx.io.fetch });
  registry.extend([resolved.merged]);
  const decodeOptions = {
    registry,
    provider: null,
    trust: officialOrLocalPolicy(),
    builtins: false,
    externalDataProvider: dataProviderOf(document.dataProvider),
    now: ctx.io.now,
  };

  const reports: CaseReport[] = [];
  for (const entry of document.tests) {
    if (!isRecord(entry) || typeof entry.description !== 'string') {
      reports.push({
        description: '(unnamed)',
        status: 'error',
        line: 1,
        message: 'Case has no description',
      });
      continue;
    }
    const line = lineOf(testsText, entry.description);
    const expected = entry.expected === undefined ? undefined : asRendered(entry.expected);
    if (entry.expected !== undefined && !expected) {
      reports.push({
        description: entry.description,
        status: 'error',
        line,
        message: 'expected is not a rendered output',
      });
      continue;
    }
    const outcome =
      typeof entry.rawTx === 'string'
        ? await runCalldataCase(entry, decodeOptions)
        : await runTypedCase(entry, decodeOptions);
    reports.push(reportCase(entry.description, line, outcome, expected, resolved.merged));
  }

  if (reporter === 'github') {
    await printGithub(ctx, reports, testsPath, descriptorPath);
  } else {
    printText(ctx, reports);
  }
  const failed = reports.some((report) => report.status !== 'pass');
  return ctx.out.result(failed ? 1 : 0);
}
