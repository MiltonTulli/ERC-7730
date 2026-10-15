import { InvalidInputError } from '../errors';
import type { ABI } from '../generate/generate';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve';
import type { TransactionInput } from '../types';
import type { Hex } from '../types/descriptor';
import { ZERO_ADDRESS, asAddress, sourceFromResolved } from './common';
import { matchContext } from './context';
import {
  fallbackOperation,
  presentDescriptorResult,
  renderFromDescriptor,
  selectorFromTx,
  tryBuiltin,
  tryTrustedToken,
} from './decodeTransactionRender';
import { expandNestedCalls } from './innerCalls';
import { beginDecode, endDecode, failDecode } from './session';
import type { DecodeOptions, DecodeRunState, DecodedOperation } from './types';
import { validateTransactionInput } from './validate';
import { finalizeDecodedWarnings, sourcifySelectorMismatch } from './warnings';

async function tryVerifiedAbi(
  tx: TransactionInput,
  selector: Hex | undefined,
  options: DecodeOptions | undefined
): Promise<{ operation: DecodedOperation | null; selectorMismatch: boolean }> {
  if (!tx.to || tx.to.toLowerCase() === ZERO_ADDRESS) {
    return { operation: null, selectorMismatch: false };
  }
  const useFallback = options?.useSourcifyFallback === true;
  const loader = options?.loadVerifiedAbi;
  if (!useFallback || !loader) {
    return { operation: null, selectorMismatch: false };
  }
  try {
    const result = await loader(tx.chainId, asAddress(tx.to));
    if (!result?.abi && !result?.descriptor) {
      return { operation: null, selectorMismatch: false };
    }
    const selectorMismatch =
      selector && result.abi ? sourcifySelectorMismatch(result.abi as ABI, selector) : false;
    if (!result.descriptor) {
      return { operation: null, selectorMismatch };
    }
    const resolved = await resolveDescriptor(result.descriptor, createMemoryIncludeLoader({}));
    const operation = await renderFromDescriptor(tx, resolved, 'sourcify', selector, options);
    return { operation, selectorMismatch };
  } catch (error) {
    options?.diagnosticLog?.push({
      stage: 'fallback',
      outcome: 'error',
      code: 'VERIFIED_ABI_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
    return { operation: null, selectorMismatch: false };
  }
}

function pushDiagnostic(
  options: DecodeOptions | undefined,
  entry: Parameters<NonNullable<DecodeOptions['diagnosticLog']>['push']>[0]
): void {
  options?.diagnosticLog?.push(entry);
}

async function decodeTransactionCore(
  tx: TransactionInput,
  options?: DecodeOptions & DecodeRunState
): Promise<DecodedOperation> {
  const selector = selectorFromTx(tx);
  const useSourcify = options?.useSourcifyFallback === true;

  if (!options?.registry) {
    pushDiagnostic(options, {
      stage: 'registry-lookup',
      outcome: 'skipped',
      code: 'REGISTRY_SKIPPED',
      message: 'No registry was provided',
    });
  } else if (!selector) {
    pushDiagnostic(options, {
      stage: 'registry-lookup',
      outcome: 'skipped',
      code: 'REGISTRY_SKIPPED',
      message: 'Transaction has no 4-byte selector',
    });
  } else {
    let found: Awaited<ReturnType<NonNullable<DecodeOptions['registry']>['findCalldata']>> = null;
    try {
      found = await options.registry.findCalldata({
        chainId: tx.chainId,
        address: asAddress(tx.to),
        selector,
        provider: options.provider,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
        cacheObserver: options.cacheObserver,
        diagnosticLog: options.diagnosticLog,
      });
    } catch (error) {
      if (error instanceof InvalidInputError) {
        throw error;
      }
      pushDiagnostic(options, {
        stage: 'include-resolve',
        outcome: 'error',
        code: 'INCLUDE_FETCH_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
      found = null;
    }
    if (!found) {
      if (!options.diagnosticLog?.entries.some((entry) => entry.code === 'INCLUDE_FETCH_FAILED')) {
        pushDiagnostic(options, {
          stage: 'registry-lookup',
          outcome: 'miss',
          code: 'REGISTRY_NO_DESCRIPTOR',
          message: 'No descriptor for this chain and address',
          details: { chainId: tx.chainId, address: tx.to, selector },
        });
        options.onEvent?.({
          type: 'registry:miss',
          chainId: tx.chainId,
          address: tx.to,
        });
      }
    } else {
      pushDiagnostic(options, {
        stage: 'registry-lookup',
        outcome: 'hit',
        code: 'REGISTRY_HIT',
        message: 'Registry returned a descriptor',
        details: { chainId: tx.chainId, address: tx.to, registryPath: found.registryPath },
      });
      const bound = await matchContext(found, tx, {
        provider: options.provider,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
        diagnosticLog: options.diagnosticLog,
      });
      if (!bound.matched) {
        pushDiagnostic(options, {
          stage: 'context-match',
          outcome: 'miss',
          code: bound.reason === 'chain_id' ? 'CHAIN_ID_MISMATCH' : 'CONTEXT_MISMATCH',
          message:
            bound.reason === 'chain_id'
              ? 'Descriptor deployments do not include this chainId'
              : 'Descriptor context did not match this transaction',
          details: { chainId: tx.chainId, address: tx.to, reason: bound.reason },
        });
      } else {
        pushDiagnostic(options, {
          stage: 'context-match',
          outcome: 'hit',
          code: 'CONTEXT_MATCHED',
          message: `Context matched via ${bound.via ?? 'deployment'}`,
          details: { via: bound.via },
        });
        const rendered = await renderFromDescriptor(
          tx,
          found,
          sourceFromResolved(found),
          selector,
          options
        );
        if (!rendered) {
          pushDiagnostic(options, {
            stage: 'format-match',
            outcome: 'miss',
            code: 'SELECTOR_NOT_IN_FORMATS',
            message: 'Selector is not listed in the descriptor formats',
            details: { selector },
          });
        } else {
          pushDiagnostic(options, {
            stage: 'format-match',
            outcome: 'hit',
            code: 'FORMAT_MATCHED',
            message: 'Selector matched a display format',
            details: { selector, signature: rendered.signature },
          });
          return finalizeDecodedWarnings(
            await presentDescriptorResult(rendered, tx, options),
            options
          );
        }
      }
    }
  }

  if (selector) {
    const trusted = await tryTrustedToken(tx, selector, options);
    if (trusted) {
      pushDiagnostic(options, {
        stage: 'fallback',
        outcome: 'hit',
        code: 'TRUSTED_TOKEN_FALLBACK',
        message: 'Rendered from a trusted-token template',
      });
      return finalizeDecodedWarnings(trusted, options);
    }
    const builtin = await tryBuiltin(tx, selector, options);
    if (builtin) {
      pushDiagnostic(options, {
        stage: 'fallback',
        outcome: 'hit',
        code: 'BUILTIN_FALLBACK',
        message: 'Rendered from an ERC-20, ERC-721, or WETH builtin',
      });
      return finalizeDecodedWarnings(builtin, options);
    }
  }

  if (useSourcify && selector) {
    const verified = await tryVerifiedAbi(tx, selector, options);
    if (verified.operation) {
      pushDiagnostic(options, {
        stage: 'fallback',
        outcome: 'hit',
        code: 'SOURCIFY_FALLBACK',
        message: 'Rendered from a Sourcify ABI',
      });
      return finalizeDecodedWarnings(verified.operation, options, {
        selectorMismatch: verified.selectorMismatch,
      });
    }
    if (verified.selectorMismatch) {
      const fallback = await fallbackOperation(tx, options);
      pushDiagnostic(options, {
        stage: 'fallback',
        outcome: 'hit',
        code: 'INFERRED_FALLBACK',
        message: 'Sourcify ABI did not match the selector',
      });
      return finalizeDecodedWarnings(fallback, options, { selectorMismatch: true });
    }
  }

  const fallback = await fallbackOperation(tx, options);
  pushDiagnostic(options, {
    stage: 'fallback',
    outcome: 'hit',
    code: fallback.source === 'basic' ? 'BASIC_FALLBACK' : 'INFERRED_FALLBACK',
    message:
      fallback.source === 'basic'
        ? 'No descriptor or known signature; showing the raw call'
        : 'No descriptor; showing fields inferred from a known signature',
  });
  return finalizeDecodedWarnings(fallback, options);
}

/**
 * Decode a transaction using an official (or override) descriptor's
 * `display.formats`. Without a match, falls back to trusted-token templates,
 * optional Sourcify, then inferred / basic — never `confidence: "high"` for
 * those sources. Multicall3 / Safe CALL expand into `children`.
 *
 * @example
 * ```ts
 * import { decodeTransaction, officialOnlyPolicy } from '@erc7730/sdk';
 *
 * const operation = await decodeTransaction(
 *   {
 *     to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
 *     data: '0xd0e30db0',
 *     value: 10n ** 18n,
 *     chainId: 1,
 *   },
 *   { trust: officialOnlyPolicy() },
 * );
 * ```
 *
 * @throws {@link InvalidInputError} `INVALID_ADDRESS`, `INVALID_HEX`,
 * `INVALID_CALLDATA`, or `INVALID_CHAIN_ID` when `tx` is not a usable transaction.
 */
export async function decodeTransaction(
  tx: TransactionInput,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  return decodeTransactionRun(tx, options);
}

/** Same decode, with recursion counters that stay off {@link DecodeOptions}. */
export async function decodeTransactionRun(
  tx: TransactionInput,
  options?: DecodeOptions & DecodeRunState
): Promise<DecodedOperation> {
  validateTransactionInput(tx);
  const session = beginDecode('transaction', options);
  const runOptions: DecodeOptions & DecodeRunState = {
    ...session.options,
    decodeRun: decodeTransactionRun,
  };
  try {
    const core = await decodeTransactionCore(tx, runOptions);
    const expanded = await expandNestedCalls(core, tx, runOptions, decodeTransactionRun);
    return endDecode('transaction', options, session, expanded);
  } catch (error) {
    failDecode('transaction', options, session.started);
    throw error;
  }
}
