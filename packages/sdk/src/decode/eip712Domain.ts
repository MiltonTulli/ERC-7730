import * as AbiParameters from 'ox/AbiParameters';
import { keccak256 } from '../keccak';
import type { TypedDataInput } from '../types';
import type { Hex } from '../types/descriptor';
import { ADDRESS_RE } from '../util';
import { asRecord } from './common';
import type { ContextMatch, MatchContextOptions } from './context';
import {
  deploymentsHaveChain,
  deploymentsInclude,
  normalizeAddr,
  readDeployments,
  resolveImplementation,
} from './proxy';

const DOMAIN_FIELD_ORDER = ['name', 'version', 'chainId', 'verifyingContract', 'salt'] as const;

export function chainIdOfTypedData(data: TypedDataInput): number | undefined {
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
  const typeHash = keccak256(typeString);
  const values: unknown[] = [typeHash];
  const params: Array<{ type: string }> = [{ type: 'bytes32' }];

  for (const field of fields) {
    const raw = data.domain[field.name as keyof typeof data.domain];
    if (raw === undefined) {
      return undefined;
    }
    if (field.type === 'string') {
      params.push({ type: 'bytes32' });
      values.push(keccak256(String(raw)));
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
    return keccak256(AbiParameters.encode(params, values as never));
  } catch {
    return undefined;
  }
}

export async function matchEip712Context(
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
    return { matched: false, reason: 'unmatched' };
  }

  if (hasDomain && domain) {
    for (const [key, expected] of Object.entries(domain)) {
      const actual = data.domain[key as keyof typeof data.domain];
      if (!domainFieldEqual(key, expected, actual)) {
        return { matched: false, reason: key === 'chainId' ? 'chain_id' : 'unmatched' };
      }
    }
  }

  if (hasDeployments) {
    const chainId = chainIdOfTypedData(data);
    const verifying = normalizeAddr(data.domain.verifyingContract);
    if (chainId === undefined || !verifying) {
      return { matched: false, reason: 'unmatched' };
    }
    if (!deploymentsInclude(deployments, chainId, verifying)) {
      const impl = await resolveImplementation(
        verifying,
        options?.provider,
        options?.diagnosticLog
      );
      if (!impl || !deploymentsInclude(deployments, chainId, impl)) {
        return {
          matched: false,
          reason: deploymentsHaveChain(deployments, chainId) ? 'address' : 'chain_id',
        };
      }
    }
  }

  if (hasSeparator) {
    const hashed = hashEip712Domain(data);
    if (!hashed || hashed.toLowerCase() !== domainSeparator.toLowerCase()) {
      return { matched: false, reason: 'unmatched' };
    }
  }

  return { matched: true, via: 'eip712' };
}
