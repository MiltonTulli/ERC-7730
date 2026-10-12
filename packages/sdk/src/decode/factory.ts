import { AbiEvent } from 'ox';
import { keccak256 } from '../keccak';
import type { Hex } from '../types/descriptor';
import { canonicalizeType, findMatchingParen, parseArraySuffix, splitTopLevel } from './abi';
import { asAddress } from './common';
import type { MatchContextOptions } from './context';
import { collectAddresses } from './logs';
import { readDeployments } from './proxy';
import type { Address } from './types';

type DeployEventInput = {
  type: string;
  name?: string;
  indexed?: boolean;
  components?: DeployEventInput[];
};

type DeployEvent = {
  type: 'event';
  name: string;
  inputs: DeployEventInput[];
};

function parseEventInputs(src: string): DeployEventInput[] {
  const trimmed = src.trim();
  if (!trimmed) {
    return [];
  }
  return splitTopLevel(trimmed).map((raw, index) => parseEventInput(raw, index));
}

function parseEventInput(raw: string, index: number): DeployEventInput {
  const src = raw.trim();
  if (src.startsWith('(')) {
    const close = findMatchingParen(src, 0);
    if (close === -1) {
      return { type: src, name: `arg${index}` };
    }
    const inner = src.slice(1, close);
    const after = src.slice(close + 1).trim();
    const { type: suffix, rest } = parseArraySuffix(after);
    const tokens = rest.split(/\s+/).filter(Boolean);
    let indexed = false;
    const nameTokens: string[] = [];
    for (const token of tokens) {
      if (token === 'indexed') {
        indexed = true;
        continue;
      }
      nameTokens.push(token);
    }
    const components = parseEventInputs(inner);
    const innerTypes = components.map((item) => item.type).join(',');
    return {
      type: `(${innerTypes})${suffix}`,
      name: nameTokens.join(' ') || `arg${index}`,
      indexed: indexed || undefined,
      components,
    };
  }

  const tokens = src.split(/\s+/).filter(Boolean);
  let indexed = false;
  const typeTokens: string[] = [];
  const nameTokens: string[] = [];
  for (const token of tokens) {
    if (token === 'indexed') {
      indexed = true;
      continue;
    }
    if (typeTokens.length === 0) {
      typeTokens.push(token);
    } else {
      nameTokens.push(token);
    }
  }
  return {
    type: canonicalizeType(typeTokens[0] ?? src),
    name: nameTokens.join(' ') || `arg${index}`,
    indexed: indexed || undefined,
  };
}

function parseDeployEvent(signature: string): DeployEvent | undefined {
  const trimmed = signature.trim();
  if (!trimmed) {
    return undefined;
  }
  const body = trimmed.replace(/^event\s+/i, '');
  const open = body.indexOf('(');
  const close = body.lastIndexOf(')');
  if (open <= 0 || close <= open) {
    return undefined;
  }
  const name = body.slice(0, open).trim();
  if (!name) {
    return undefined;
  }
  return {
    type: 'event',
    name,
    inputs: parseEventInputs(body.slice(open + 1, close)),
  };
}

function eventTopic0(event: DeployEvent): Hex {
  const types = event.inputs.map((input) => input.type).join(',');
  return keccak256(`${event.name}(${types})`);
}

function thrownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function matchFactory(
  factory: Record<string, unknown>,
  chainId: number,
  target: Address,
  options: MatchContextOptions | undefined
): Promise<boolean> {
  if (typeof factory.deployEvent !== 'string') {
    return false;
  }
  const deployments = readDeployments(factory.deployments).filter(
    (item) => item.chainId === chainId
  );
  if (deployments.length === 0) {
    return false;
  }
  const event = parseDeployEvent(factory.deployEvent);
  if (!event) {
    return false;
  }
  const provider = options?.provider;
  if (!provider || typeof provider.getLogs !== 'function') {
    return false;
  }

  const topic0 = eventTopic0(event);
  const factories = deployments.map((item) => item.address);
  let logs: ReadonlyArray<{
    address?: string;
    topics?: readonly string[];
    data?: string;
  }>;
  try {
    logs = await provider.getLogs({
      address: [...factories],
      topics: [topic0],
      fromBlock: options?.fromBlock ?? 'earliest',
      toBlock: options?.toBlock ?? 'latest',
    });
  } catch (error) {
    options?.diagnosticLog?.push({
      stage: 'context-match',
      outcome: 'error',
      code: 'FACTORY_LOGS_FAILED',
      message: thrownMessage(error),
    });
    return false;
  }

  const want = target.toLowerCase();
  const factorySet = new Set(factories);

  for (const log of logs ?? []) {
    const emitter = typeof log.address === 'string' ? log.address.toLowerCase() : '';
    if (!factorySet.has(asAddress(emitter))) {
      continue;
    }
    const topics = (log.topics ?? []).filter((topic): topic is Hex => typeof topic === 'string');
    if (topics.length === 0 || topics[0].toLowerCase() !== topic0.toLowerCase()) {
      continue;
    }
    try {
      const decoded = AbiEvent.decode(event, {
        data: (log.data ?? '0x') as Hex,
        topics: topics as [Hex, ...Hex[]],
      });
      const found = new Set<string>();
      collectAddresses(decoded, found);
      if (found.has(want)) {
        return true;
      }
    } catch {
      const found = new Set<string>();
      collectAddresses(topics, found);
      collectAddresses(log.data, found);
      if (found.has(want)) {
        return true;
      }
    }
  }

  return false;
}
