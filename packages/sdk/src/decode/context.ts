/**
 * ERC-7730 v2 context matching.
 *
 * A descriptor is applied only when the transaction / typed-data payload
 * satisfies `context`. Matching uses the official schema:
 *   - `contract.deployments` (exact chainId + address)
 *   - EIP-1967 implementation slot / EIP-1167 bytecode (proxy → a deployment)
 *   - `contract.factory` (`deployments` + `deployEvent` signature, decoded via ABI)
 *   - `eip712.domain` / `eip712.deployments` / `eip712.domainSeparator`
 *
 * `addressMatcher` URLs are not fetched (v1 draft; absent from v2). Unknown
 * addresses fail closed. Factory event layouts are taken from `deployEvent`,
 * not hardcoded.
 */

import type { AbiEvent, AbiParameter } from 'abitype';
import { parseAbiItem, parseAbiParameters } from 'abitype';
import { decodeEventLog, encodeAbiParameters, keccak256, toBytes } from 'viem';
import { isPlainObject } from '../resolve/util.js';
import type { Hex, InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';
import type { Provider, TransactionInput, TypedDataInput } from '../types/index.js';
import { ZERO_ADDRESS, asAddress, asRecord } from './common.js';
import type { Address } from './types.js';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** EIP-1967 implementation slot: `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`. */
export const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex;

const EIP1167_PREFIX = '0x363d3d373d3d3d363d73';
const EIP1167_SUFFIX = '5af43d82803e903d91602b57fd5bf3';

const DOMAIN_FIELD_ORDER = ['name', 'version', 'chainId', 'verifyingContract', 'salt'] as const;

export type ContextMatchVia = 'deployment' | 'factory' | 'proxy' | 'eip712';

export interface ContextMatch {
  matched: boolean;
  via?: ContextMatchVia;
}

export interface MatchContextOptions {
  provider?: Provider | null;
}

type DescriptorLike = InputDescriptor | ResolvedDescriptor;

function isResolved(descriptor: DescriptorLike): descriptor is ResolvedDescriptor {
  return (
    isPlainObject(descriptor) &&
    'merged' in descriptor &&
    'hash' in descriptor &&
    'input' in descriptor &&
    'deployments' in descriptor
  );
}

function mergedOf(descriptor: DescriptorLike): InputDescriptor {
  return isResolved(descriptor) ? descriptor.merged : descriptor;
}

function isTypedData(target: TransactionInput | TypedDataInput): target is TypedDataInput {
  return (
    isPlainObject(target) && 'domain' in target && 'primaryType' in target && 'types' in target
  );
}

function normalizeAddr(value: string | undefined): Address | undefined {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) {
    return undefined;
  }
  return asAddress(value.toLowerCase());
}

function readDeployments(value: unknown): Array<{ chainId: number; address: Address }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Array<{ chainId: number; address: Address }> = [];
  for (const item of value) {
    if (
      !isPlainObject(item) ||
      typeof item.chainId !== 'number' ||
      typeof item.address !== 'string'
    ) {
      continue;
    }
    const address = normalizeAddr(item.address);
    if (!address) {
      continue;
    }
    out.push({ chainId: item.chainId, address });
  }
  return out;
}

function chainIdOfTypedData(data: TypedDataInput): number | undefined {
  const raw = data.chainId ?? data.domain.chainId;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'bigint') {
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : undefined;
  }
  if (typeof raw === 'number' && Number.isSafeInteger(raw)) {
    return raw;
  }
  return undefined;
}

function deploymentsInclude(
  deployments: Array<{ chainId: number; address: Address }>,
  chainId: number,
  address: Address
): boolean {
  const want = address.toLowerCase();
  return deployments.some((item) => item.chainId === chainId && item.address === want);
}

function addressFromWord(word: string | null | undefined): Address | undefined {
  if (typeof word !== 'string' || !word.startsWith('0x')) {
    return undefined;
  }
  const hex = word.slice(2).replace(/^0+/, '').padStart(40, '0');
  if (hex.length !== 40 || !/^[0-9a-fA-F]{40}$/.test(hex)) {
    return undefined;
  }
  const address = asAddress(`0x${hex.toLowerCase()}`);
  if (address === ZERO_ADDRESS) {
    return undefined;
  }
  return address;
}

function collectAddresses(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (ADDRESS_RE.test(value)) {
      into.add(value.toLowerCase());
      return;
    }
    // Indexed addresses are 32-byte topics (`0x` + 24 zero bytes + 20-byte address).
    if (/^0x0{24}[0-9a-fA-F]{40}$/i.test(value)) {
      const address = normalizeAddr(`0x${value.slice(-40)}`);
      if (address) {
        into.add(address);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAddresses(item, into);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) {
      collectAddresses(item, into);
    }
  }
}

/**
 * Read the implementation address of a well-known proxy. Custom slots (Safe
 * singleton at slot 0, etc.) are not guessed.
 */
export async function resolveImplementation(
  address: Address,
  provider: Provider | null | undefined
): Promise<Address | undefined> {
  if (!provider) {
    return undefined;
  }

  if (typeof provider.getStorageAt === 'function') {
    try {
      const word = await provider.getStorageAt({
        address: asAddress(address),
        slot: EIP1967_IMPLEMENTATION_SLOT,
      });
      const impl = addressFromWord(word ?? undefined);
      if (impl) {
        return impl;
      }
    } catch {
      // Fall through to bytecode.
    }
  }

  if (typeof provider.getCode === 'function') {
    try {
      const code = await provider.getCode({ address: asAddress(address) });
      const hex = typeof code === 'string' ? code.toLowerCase() : '';
      if (hex.startsWith(EIP1167_PREFIX) && hex.endsWith(EIP1167_SUFFIX)) {
        const middle = hex.slice(EIP1167_PREFIX.length, hex.length - EIP1167_SUFFIX.length);
        const impl = middle.length === 40 ? normalizeAddr(`0x${middle}`) : undefined;
        if (impl) {
          return impl;
        }
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function splitTopLevel(src: string): string[] {
  if (!src.trim()) {
    return [];
  }
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of src) {
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    }
    if (char === ',' && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function looksLikeTypeToken(token: string): boolean {
  return /^(address|bool|string|bytes([1-9][0-9]?)?|u?int\d*|u?fixed\d+x\d+|tuple\b)/i.test(token);
}

function injectParamNames(params: string): string {
  return splitTopLevel(params)
    .map((raw, index) => {
      const tokens = raw.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) {
        return raw;
      }
      const last = tokens[tokens.length - 1];
      if (
        last === 'indexed' ||
        looksLikeTypeToken(last) ||
        last.startsWith('(') ||
        /\[\d*\]$/.test(last)
      ) {
        return `${raw.trim()} arg${index}`;
      }
      return raw.trim();
    })
    .join(',');
}

function parseDeployEvent(signature: string): AbiEvent | undefined {
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
  const params = injectParamNames(body.slice(open + 1, close));
  const source = `event ${name}(${params})`;
  try {
    const item = parseAbiItem(source);
    if (item.type !== 'event') {
      return undefined;
    }
    return item;
  } catch {
    try {
      const inputs = [...parseAbiParameters(params)] as AbiParameter[];
      return {
        type: 'event',
        name,
        inputs,
      };
    } catch {
      return undefined;
    }
  }
}

function eventCanonical(event: AbiEvent): string {
  const types = (event.inputs ?? []).map((input) => input.type).join(',');
  return `${event.name}(${types})`;
}

function eventTopic0(event: AbiEvent): Hex {
  return keccak256(toBytes(eventCanonical(event)));
}

async function matchFactory(
  factory: Record<string, unknown>,
  chainId: number,
  target: Address,
  provider: Provider | null | undefined
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
    });
  } catch {
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
      const decoded = decodeEventLog({
        abi: [event],
        data: (log.data ?? '0x') as Hex,
        topics: topics as [Hex, ...Hex[]],
      });
      const found = new Set<string>();
      collectAddresses(decoded.args, found);
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

function domainFieldEqual(key: string, expected: unknown, actual: unknown): boolean {
  if (expected === undefined) {
    return true;
  }
  if (actual === undefined || actual === null) {
    return false;
  }
  if (key === 'verifyingContract') {
    const left = typeof expected === 'string' ? expected.toLowerCase() : '';
    const right = typeof actual === 'string' ? actual.toLowerCase() : '';
    return ADDRESS_RE.test(left) && left === right;
  }
  if (key === 'chainId') {
    try {
      return (
        BigInt(expected as string | number | bigint) === BigInt(actual as string | number | bigint)
      );
    } catch {
      return false;
    }
  }
  return expected === actual;
}

function hashEip712Domain(data: TypedDataInput): Hex | undefined {
  const declared = data.types.EIP712Domain;
  const fields =
    declared && declared.length > 0
      ? declared
      : DOMAIN_FIELD_ORDER.filter((name) => data.domain[name] !== undefined).map((name) => ({
          name,
          type:
            name === 'chainId'
              ? 'uint256'
              : name === 'salt'
                ? 'bytes32'
                : name === 'verifyingContract'
                  ? 'address'
                  : 'string',
        }));
  if (fields.length === 0) {
    return undefined;
  }

  const typeString = `EIP712Domain(${fields.map((field) => `${field.type} ${field.name}`).join(',')})`;
  const typeHash = keccak256(toBytes(typeString));
  const values: unknown[] = [typeHash];
  const params: Array<{ type: string }> = [{ type: 'bytes32' }];

  for (const field of fields) {
    const raw = data.domain[field.name as keyof typeof data.domain];
    if (raw === undefined) {
      return undefined;
    }
    if (field.type === 'string') {
      params.push({ type: 'bytes32' });
      values.push(keccak256(toBytes(String(raw))));
    } else if (field.type === 'uint256' || field.type === 'uint') {
      params.push({ type: 'uint256' });
      values.push(BigInt(raw as string | number | bigint));
    } else if (field.type === 'address') {
      params.push({ type: 'address' });
      values.push(raw);
    } else if (field.type === 'bytes32') {
      params.push({ type: 'bytes32' });
      values.push(raw);
    } else {
      params.push({ type: field.type });
      values.push(raw);
    }
  }

  try {
    return keccak256(encodeAbiParameters(params, values));
  } catch {
    return undefined;
  }
}

async function matchContractContext(
  contract: Record<string, unknown>,
  chainId: number,
  address: Address,
  options: MatchContextOptions | undefined
): Promise<ContextMatch> {
  const deployments = readDeployments(contract.deployments);
  const factory = asRecord(contract.factory);
  const hasFactory = factory !== undefined && typeof factory.deployEvent === 'string';

  if (deployments.length === 0 && !hasFactory) {
    return { matched: false };
  }

  if (deployments.length > 0 && deploymentsInclude(deployments, chainId, address)) {
    return { matched: true, via: 'deployment' };
  }

  if (deployments.length > 0) {
    const impl = await resolveImplementation(address, options?.provider);
    if (impl && deploymentsInclude(deployments, chainId, impl)) {
      return { matched: true, via: 'proxy' };
    }
  }

  if (hasFactory && factory && (await matchFactory(factory, chainId, address, options?.provider))) {
    return { matched: true, via: 'factory' };
  }

  return { matched: false };
}

async function matchEip712Context(
  eip712: Record<string, unknown>,
  data: TypedDataInput,
  options: MatchContextOptions | undefined
): Promise<ContextMatch> {
  const domain = asRecord(eip712.domain);
  const deployments = readDeployments(eip712.deployments);
  const domainSeparator =
    typeof eip712.domainSeparator === 'string' ? eip712.domainSeparator : undefined;
  const hasDomain = domain !== undefined && Object.keys(domain).length > 0;
  const hasDeployments = deployments.length > 0;
  const hasSeparator = typeof domainSeparator === 'string' && domainSeparator.length > 0;

  if (!hasDomain && !hasDeployments && !hasSeparator) {
    return { matched: false };
  }

  if (hasDomain && domain) {
    for (const [key, expected] of Object.entries(domain)) {
      const actual = data.domain[key as keyof typeof data.domain];
      if (!domainFieldEqual(key, expected, actual)) {
        return { matched: false };
      }
    }
  }

  if (hasDeployments) {
    const chainId = chainIdOfTypedData(data);
    const verifying = normalizeAddr(data.domain.verifyingContract);
    if (chainId === undefined || !verifying) {
      return { matched: false };
    }
    if (!deploymentsInclude(deployments, chainId, verifying)) {
      const impl = await resolveImplementation(verifying, options?.provider);
      if (!impl || !deploymentsInclude(deployments, chainId, impl)) {
        return { matched: false };
      }
    }
  }

  if (hasSeparator) {
    const hashed = hashEip712Domain(data);
    if (!hashed || hashed.toLowerCase() !== domainSeparator.toLowerCase()) {
      return { matched: false };
    }
  }

  return { matched: true, via: 'eip712' };
}

/**
 * Whether `descriptor` may be applied to `target`.
 *
 * Used by `decodeTransaction` / `decodeTypedData` and by registry lookup so a
 * familiar selector on an unbound address never yields `confidence: "high"`.
 */
export async function matchContext(
  descriptor: DescriptorLike,
  target: TransactionInput | TypedDataInput,
  options?: MatchContextOptions
): Promise<ContextMatch> {
  const merged = mergedOf(descriptor);
  const context = asRecord(merged.context);
  if (!context) {
    return { matched: false };
  }

  if (isTypedData(target)) {
    const eip712 = asRecord(context.eip712);
    if (!eip712) {
      return { matched: false };
    }
    return matchEip712Context(eip712, target, options);
  }

  const contract = asRecord(context.contract);
  if (!contract) {
    return { matched: false };
  }
  const address = normalizeAddr(target.to);
  if (!address || typeof target.chainId !== 'number') {
    return { matched: false };
  }
  return matchContractContext(contract, target.chainId, address, options);
}
