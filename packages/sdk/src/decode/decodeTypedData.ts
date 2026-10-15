import { InvalidInputError } from '../errors';
import type { TypedDataInput } from '../types';
import type { Hex, ResolvedDescriptor } from '../types/descriptor';
import { asAddress, asRecord, sourceFromResolved } from './common';
import { matchContext } from './context';
import {
  fallbackOperation,
  presentDescriptorResult,
  renderFromDescriptor,
} from './decodeTypedDataRender';
import { beginDecode, endDecode, failDecode } from './session';
import { encodeType, hashEncodeType, normalizeTypedDataMessage } from './typedData';
import type { Address, DecodeOptions, DecodedOperation } from './types';
import { validateTypedDataInput } from './validate';
import { finalizeDecodedWarnings } from './warnings';

function chainIdOf(data: TypedDataInput): number | undefined {
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

function verifyingContractOf(data: TypedDataInput): Address | undefined {
  const value = data.domain.verifyingContract;
  if (typeof value !== 'string' || !value.startsWith('0x') || value.length !== 42) {
    return undefined;
  }
  return asAddress(value);
}

async function lookupEip712(
  data: TypedDataInput,
  options: DecodeOptions | undefined,
  chainId: number | undefined,
  address: Address | undefined,
  encodeTypeHash: Hex
): Promise<ResolvedDescriptor | null> {
  const registry = options?.registry;
  if (!registry || chainId === undefined || !address) {
    return null;
  }
  const find = registry.findEip712;
  if (typeof find !== 'function') {
    return null;
  }
  return find.call(registry, {
    chainId,
    address,
    signature: data.primaryType,
    encodeTypeHash,
    typedData: data,
    provider: options?.provider,
    cacheObserver: options?.cacheObserver,
    fromBlock: options?.fromBlock,
    toBlock: options?.toBlock,
    diagnosticLog: options?.diagnosticLog,
  });
}

/**
 * Decode an EIP-712 payload using an official (or override) descriptor from
 * `index.eip712.json`. Lookup is CAIP-10 `eip155:{chainId}:{verifyingContract}`
 * plus `primaryType` / keccak256(`encodeType`). Without a match, falls back to
 * inferred fields from the payload types — never `confidence: "high"`.
 */
async function decodeTypedDataCore(
  data: TypedDataInput,
  options: DecodeOptions | undefined
): Promise<DecodedOperation> {
  const chainId = chainIdOf(data);
  const address = verifyingContractOf(data);
  const encoded = encodeType(data.primaryType, data.types);
  const encodeTypeHash = hashEncodeType(data.primaryType, data.types);
  const message = asRecord(data.message)
    ? normalizeTypedDataMessage(data.message, data.types, data.primaryType)
    : {};

  const registry = options?.registry;
  if (!registry || chainId === undefined || !address || typeof registry.findEip712 !== 'function') {
    options?.diagnosticLog?.push({
      stage: 'registry-lookup',
      outcome: 'skipped',
      code: 'REGISTRY_SKIPPED',
      message: 'No EIP-712 registry lookup for this payload',
    });
  }

  let found: ResolvedDescriptor | null = null;
  try {
    found = await lookupEip712(data, options, chainId, address, encodeTypeHash);
  } catch (error) {
    if (error instanceof InvalidInputError) {
      throw error;
    }
    options?.diagnosticLog?.push({
      stage: 'include-resolve',
      outcome: 'error',
      code: 'INCLUDE_FETCH_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
    found = null;
  }

  if (registry && chainId !== undefined && address && typeof registry.findEip712 === 'function') {
    if (!found) {
      if (!options?.diagnosticLog?.entries.some((entry) => entry.code === 'INCLUDE_FETCH_FAILED')) {
        options?.diagnosticLog?.push({
          stage: 'registry-lookup',
          outcome: 'miss',
          code: 'REGISTRY_NO_DESCRIPTOR',
          message: 'No EIP-712 descriptor for this domain',
          details: { chainId, address, primaryType: data.primaryType },
        });
        options?.onEvent?.({ type: 'registry:miss', chainId, address });
      }
    } else {
      options?.diagnosticLog?.push({
        stage: 'registry-lookup',
        outcome: 'hit',
        code: 'REGISTRY_HIT',
        message: 'Registry returned an EIP-712 descriptor',
        details: { chainId, address, registryPath: found.registryPath },
      });
      const bound = await matchContext(found, data, {
        provider: options?.provider,
        fromBlock: options?.fromBlock,
        toBlock: options?.toBlock,
        diagnosticLog: options?.diagnosticLog,
      });
      if (!bound.matched) {
        options?.diagnosticLog?.push({
          stage: 'context-match',
          outcome: 'miss',
          code: bound.reason === 'chain_id' ? 'CHAIN_ID_MISMATCH' : 'CONTEXT_MISMATCH',
          message:
            bound.reason === 'chain_id'
              ? 'Descriptor deployments do not include this chainId'
              : 'EIP-712 context did not match this payload',
          details: { chainId, address, reason: bound.reason },
        });
      } else {
        options?.diagnosticLog?.push({
          stage: 'context-match',
          outcome: 'hit',
          code: 'CONTEXT_MATCHED',
          message: 'EIP-712 context matched',
          details: { via: bound.via },
        });
        const rendered = await renderFromDescriptor(
          data,
          message,
          found,
          sourceFromResolved(found),
          encoded,
          chainId,
          address,
          options
        );
        if (!rendered) {
          options?.diagnosticLog?.push({
            stage: 'format-match',
            outcome: 'miss',
            code: 'SELECTOR_NOT_IN_FORMATS',
            message: 'primaryType is not listed in the descriptor formats',
            details: { primaryType: data.primaryType },
          });
        } else {
          options?.diagnosticLog?.push({
            stage: 'format-match',
            outcome: 'hit',
            code: 'FORMAT_MATCHED',
            message: 'primaryType matched a display format',
            details: { primaryType: data.primaryType },
          });
          return finalizeDecodedWarnings(
            await presentDescriptorResult(
              rendered,
              data,
              message,
              encoded,
              chainId,
              address,
              options
            ),
            options
          );
        }
      }
    }
  }

  const fallback = await fallbackOperation(data, message, encoded, chainId, address, options);
  options?.diagnosticLog?.push({
    stage: 'fallback',
    outcome: 'hit',
    code: 'INFERRED_FALLBACK',
    message: 'No EIP-712 descriptor; showing fields from the typed-data message',
  });
  return finalizeDecodedWarnings(fallback, options);
}

/**
 * Decode EIP-712 typed data. Domain and `domainSeparator` bindings go through
 * {@link matchContext}. With no descriptor, fields come from the message.
 *
 * @throws {@link InvalidInputError} `INVALID_TYPED_DATA` when `domain`, `types`,
 * `primaryType`, or `message` is missing, and `INVALID_CHAIN_ID` or
 * `INVALID_ADDRESS` when those fields are present but not usable.
 */
export async function decodeTypedData(
  data: TypedDataInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  validateTypedDataInput(data);
  const session = beginDecode('typed-data', options);
  try {
    const operation = await decodeTypedDataCore(data, session.options);
    return endDecode('typed-data', options, session, operation);
  } catch (error) {
    failDecode('typed-data', options, session.started);
    throw error;
  }
}
