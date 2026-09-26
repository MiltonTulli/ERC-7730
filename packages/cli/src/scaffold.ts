import { basename } from 'node:path';
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
import { SCAFFOLD_HELP } from './help.js';
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

function slugify(owner: string, address: string): string {
  const base = owner
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const short = address.slice(2, 8).toLowerCase();
  return (base || 'contract').slice(0, 40) || short;
}

export async function runScaffold(args: string[], ctx: CliContext): Promise<CliResult> {
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
    throw new UsageError(error instanceof Error ? error.message : String(error), SCAFFOLD_HELP);
  }

  if (values.help) {
    ctx.out.println(SCAFFOLD_HELP);
    return ctx.out.result(0);
  }

  const chainId = parseChainId(values['chain-id']);
  if (!values.address) {
    throw new UsageError('--address is required', SCAFFOLD_HELP);
  }
  if (!values.abi) {
    throw new UsageError('--abi is required', SCAFFOLD_HELP);
  }
  if (!values.owner) {
    throw new UsageError('--owner is required', SCAFFOLD_HELP);
  }
  if (!values.out) {
    throw new UsageError('--out is required', SCAFFOLD_HELP);
  }

  const address = parseAddress(values.address, '--address');
  const abi = await readAbiSource(values.abi, ctx);
  const slug = slugify(values.owner, address);

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
    ctx.out.eprintln('scaffold produced a document that failed v2 schema validation:');
    for (const error of validated.errors) {
      ctx.out.eprintln(`  ${error.path}  ${error.message}`);
    }
    return ctx.out.result(1);
  }

  const outDir = resolvePath(ctx.io.cwd, values.out);
  const descriptorName = `calldata-${slug}.json`;
  const descriptorPath = resolvePath(outDir, descriptorName);
  const testsDir = resolvePath(outDir, 'testsv2');
  const testsName = `${slug}.tests.json`;
  const testsPath = resolvePath(testsDir, testsName);

  const testsDoc = {
    $schema:
      'https://github.com/ethereum/clear-signing-erc7730-registry/blob/master/specs/erc7730-tests-v2.schema.json',
    descriptor: `../${descriptorName}`,
    tests: [
      {
        description: 'TODO: replace with a real calldata fixture',
        rawTx: '0x00',
        expected: {
          intent: 'TODO',
          fields: [],
        },
      },
    ],
  };

  await writeTextFile(descriptorPath, prettyJson(draft));
  await writeTextFile(testsPath, prettyJson(testsDoc));

  const tree = [
    `${basename(outDir)}/`,
    `  ${descriptorName}`,
    '  testsv2/',
    `    ${testsName}`,
  ].join('\n');
  ctx.out.println('Wrote registry-shaped tree (copy into a fork of the official registry):');
  ctx.out.println(tree);
  ctx.out.println('');
  ctx.out.println('Next: edit the descriptor, replace the TODO test, then:');
  ctx.out.println(`  erc7730 lint ${descriptorPath}`);
  ctx.out.println(`  erc7730 lint --tests ${testsPath}`);
  return ctx.out.result(0);
}
