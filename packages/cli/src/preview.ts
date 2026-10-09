import { parseArgs } from 'node:util';
import {
  type Hex,
  type TransactionInput,
  decodeTransaction,
  sourcifyVerifiedAbiLoader,
} from '@erc7730/sdk';
import { parseAddress, parseChainId } from './fsjson';
import { PREVIEW_HELP } from './help';
import { openRegistry, pinOrigin, resolvePin } from './registry';
import type { PinOrigin } from './registry';
import type { CliContext, CliResult } from './types';
import { HEX_RE, UsageError } from './types';

function parseHex(value: string | undefined, flag: string): Hex {
  if (!value) {
    throw new UsageError(`${flag} is required`, PREVIEW_HELP);
  }
  if (!HEX_RE.test(value) || value.length % 2 !== 0) {
    throw new UsageError(`${flag} must be 0x-prefixed even-length hex`);
  }
  return value as Hex;
}

function parseValue(value: string | undefined): TransactionInput['value'] {
  if (value === undefined) {
    return undefined;
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new UsageError('--value must be a decimal integer or 0x-prefixed hex');
  }
  if (parsed < 0n) {
    throw new UsageError('--value must be non-negative');
  }
  if (HEX_RE.test(value)) {
    return value as Hex;
  }
  return parsed;
}

function pinLine(pin: string, origin: PinOrigin): string {
  if (origin === 'flag') {
    return `Pin: ${pin} (--pin)`;
  }
  if (origin === 'env') {
    return `Pin: ${pin} (ERC7730_REGISTRY_PIN)`;
  }
  return `Pin: ${pin} (vendored default)`;
}

function formatPreview(
  result: Awaited<ReturnType<typeof decodeTransaction>>,
  pin: string,
  origin: PinOrigin
): string {
  const lines: string[] = [];
  lines.push(`Intent: ${result.intent}`);
  if (result.interpolatedIntent) {
    lines.push(`Interpolated: ${result.interpolatedIntent}`);
  }
  lines.push(
    `Source: ${result.source}    Confidence: ${result.confidence}    Trust: ${
      result.trust.accepted ? 'accepted' : 'rejected'
    } (${result.trust.policy})`
  );
  lines.push(pinLine(pin, origin));
  if (result.trust.reasons.length > 0) {
    lines.push(`Trust reasons: ${result.trust.reasons.join(', ')}`);
  }
  if (result.signature) {
    lines.push(`Signature: ${result.signature}`);
  }
  if (result.children && result.children.length > 0) {
    lines.push(`Children: ${result.children.length}`);
  }
  lines.push('');
  lines.push('Fields:');
  if (result.fields.length === 0) {
    lines.push('  (none)');
  } else {
    for (const field of result.fields) {
      lines.push(`  ${field.label}\t${field.value}\t${field.format}\t${field.path}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      const path = warning.path ? ` ${warning.path}` : '';
      lines.push(`  [${warning.severity}] ${warning.type}${path} — ${warning.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function formatDiagnostics(result: Awaited<ReturnType<typeof decodeTransaction>>): string {
  const lines = ['Diagnostics:'];
  if (result.diagnostics.length === 0) {
    lines.push('  (none)');
  } else {
    for (const item of result.diagnostics) {
      lines.push(`  ${item.stage} ${item.code} ${item.outcome} ${item.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export async function runPreview(args: string[], ctx: CliContext): Promise<CliResult> {
  let values: {
    help?: boolean;
    data?: string;
    to?: string;
    'chain-id'?: string;
    from?: string;
    value?: string;
    pin?: string;
    'registry-path'?: string;
    json?: boolean;
    sourcify?: boolean;
    explain?: boolean;
  };
  try {
    values = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
        data: { type: 'string' },
        to: { type: 'string' },
        'chain-id': { type: 'string' },
        from: { type: 'string' },
        value: { type: 'string' },
        pin: { type: 'string' },
        'registry-path': { type: 'string' },
        json: { type: 'boolean' },
        sourcify: { type: 'boolean' },
        explain: { type: 'boolean' },
      },
    }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), PREVIEW_HELP);
  }

  if (values.help) {
    ctx.out.println(PREVIEW_HELP);
    return ctx.out.result(0);
  }

  const chainId = parseChainId(values['chain-id']);
  if (!values.to) {
    throw new UsageError('--to is required', PREVIEW_HELP);
  }
  const to = parseAddress(values.to, '--to');
  const data = parseHex(values.data, '--data');
  const tx: TransactionInput = {
    chainId,
    to,
    data,
  };
  if (values.from) {
    tx.from = parseAddress(values.from, '--from');
  }
  const value = parseValue(values.value);
  if (value !== undefined) {
    tx.value = value;
  }

  const origin = pinOrigin(values.pin, ctx.io.env);
  const pin = resolvePin(values.pin, ctx.io.env);
  const registry = await openRegistry(ctx, {
    pin,
    registryPath: values['registry-path'],
  });

  const useSourcify = values.sourcify === true;
  const decoded = await decodeTransaction(tx, {
    registry,
    provider: null,
    useSourcifyFallback: useSourcify,
    ...(useSourcify ? { loadVerifiedAbi: sourcifyVerifiedAbiLoader } : {}),
    now: ctx.io.now,
  });

  if (values.json) {
    ctx.out.writeOut(`${JSON.stringify(decoded, jsonReplacer, 2)}\n`);
  } else {
    ctx.out.writeOut(formatPreview(decoded, pin, origin));
    if (values.explain) {
      ctx.out.writeOut(formatDiagnostics(decoded));
    }
  }
  return ctx.out.result(0);
}
