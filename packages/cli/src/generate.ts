import { parseArgs } from 'node:util';
import { type ABI, generateDescriptor, validateDescriptor } from '@erc7730/sdk';
import {
  parseAddress,
  parseChainId,
  prettyJson,
  readJsonFile,
  resolvePath,
  writeTextFile,
} from './fsjson.js';
import { GENERATE_HELP } from './help.js';
import type { CliContext, CliResult } from './types.js';
import { UsageError } from './types.js';
import { toV2Draft } from './v2.js';

function parseAbi(value: unknown, source: string): ABI {
  if (Array.isArray(value)) {
    return value as ABI;
  }
  if (value && typeof value === 'object' && Array.isArray((value as { abi?: unknown }).abi)) {
    return (value as { abi: ABI }).abi;
  }
  throw new UsageError(
    `${source}: expected an ABI array or an artifact object with an "abi" field`
  );
}

async function readAbiSource(spec: string, ctx: CliContext): Promise<ABI> {
  if (spec === '-') {
    const text = ctx.io.stdin;
    if (text === undefined) {
      throw new UsageError('--abi - requires stdin (pass the ABI JSON to the process)');
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new UsageError(`stdin: invalid JSON (${message})`);
    }
    return parseAbi(json, 'stdin');
  }

  const path = resolvePath(ctx.io.cwd, spec);
  return parseAbi(await readJsonFile(path), spec);
}

export async function runGenerate(args: string[], ctx: CliContext): Promise<CliResult> {
  let values: {
    help?: boolean;
    'chain-id'?: string;
    address?: string;
    abi?: string;
    owner?: string;
    url?: string;
    out?: string;
  };
  try {
    values = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
        'chain-id': { type: 'string' },
        address: { type: 'string' },
        abi: { type: 'string' },
        owner: { type: 'string' },
        url: { type: 'string' },
        out: { type: 'string' },
      },
    }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), GENERATE_HELP);
  }

  if (values.help) {
    ctx.out.println(GENERATE_HELP);
    return ctx.out.result(0);
  }

  const chainId = parseChainId(values['chain-id']);
  if (!values.address) {
    throw new UsageError('--address is required', GENERATE_HELP);
  }
  if (!values.abi) {
    throw new UsageError('--abi is required', GENERATE_HELP);
  }
  if (!values.owner) {
    throw new UsageError('--owner is required', GENERATE_HELP);
  }

  const address = parseAddress(values.address, '--address');
  const abi = await readAbiSource(values.abi, ctx);

  const draft = toV2Draft(
    generateDescriptor({
      chainId,
      address,
      abi,
      owner: values.owner,
      url: values.url,
    })
  );

  const validated = validateDescriptor(draft);
  if (!validated.ok) {
    ctx.out.eprintln('generate produced a document that failed v2 schema validation:');
    for (const error of validated.errors) {
      ctx.out.eprintln(`  ${error.path}  ${error.message}`);
    }
    return ctx.out.result(1);
  }
  if (validated.version !== '2') {
    ctx.out.eprintln(`generate expected a v2 descriptor, got version ${validated.version}`);
    return ctx.out.result(1);
  }

  const json = prettyJson(draft);
  ctx.out.writeOut(json);
  if (values.out) {
    const outPath = resolvePath(ctx.io.cwd, values.out);
    await writeTextFile(outPath, json);
  }
  return ctx.out.result(0);
}
