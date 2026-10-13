import { computeSelector, getSignatureBySelector } from '../core/signatures';
import type { ABI, ABIParameter } from '../generate/generate';
import type { Hex } from '../types/descriptor';
import { nowSeconds } from './common';
import {
  DEADLINE_ARG_INDEX,
  DEADLINE_PATH,
  collectNamedValues,
  expiredDeadlineWarning,
  untrustedSpenderWarning,
} from './spenderWarning';
import type {
  DecodeOptions,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
  SecurityWarningType,
} from './types';
const OWNERSHIP_NAME =
  /^(transferOwnership|setOwner|changeOwner|changeAdmin|setAdmin|renounceOwnership)$/i;
const PROXY_UPGRADE_NAME = /^(upgradeTo|upgradeToAndCall)$/i;

const OWNERSHIP_SELECTORS = new Set([
  '0xf2fde38b', // transferOwnership(address)
  '0x13af4035', // setOwner(address)
  '0x8f283970', // changeAdmin(address)
]);

const PROXY_UPGRADE_SELECTORS = new Set([
  '0x3659cfe6', // upgradeTo(address)
  '0x4f1ef286', // upgradeToAndCall(address,bytes)
]);

export interface WarningScan {
  functionName?: string;
  signature?: string;
  selector?: Hex;
  fields: DecodedField[];
  /** Positional decoded args; not filtered by display `excluded`. */
  args?: readonly unknown[];
  /** EIP-712 message; not filtered by display `excluded`. */
  message?: Record<string, unknown>;
  source: DecodeSource;
  chainId?: number;
  selectorMismatch?: boolean;
}

function hasWarning(
  warnings: SecurityWarning[],
  type: SecurityWarningType,
  path?: string
): boolean {
  return warnings.some(
    (warning) => warning.type === type && (path === undefined || warning.path === path)
  );
}

function operationName(
  functionName?: string,
  signature?: string,
  selector?: string
): string | undefined {
  if (functionName) {
    return functionName;
  }
  if (typeof signature === 'string') {
    const match = signature.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    if (match) {
      return match[1];
    }
  }
  if (selector) {
    return getSignatureBySelector(selector)?.name;
  }
  return undefined;
}

function abiParamType(param: ABIParameter): string {
  if (param.components && (param.type === 'tuple' || param.type.startsWith('tuple'))) {
    const inner = param.components.map(abiParamType).join(',');
    const bracket = param.type.indexOf('[');
    const suffix = bracket === -1 ? '' : param.type.slice(bracket);
    return `(${inner})${suffix}`;
  }
  return param.type;
}

export function abiFunctionName(abi: ABI, selector: string): string | undefined {
  const want = selector.toLowerCase();
  for (const item of abi) {
    if (item.type !== 'function' || typeof item.name !== 'string') {
      continue;
    }
    const types = (item.inputs ?? []).map(abiParamType);
    const computed = computeSelector(`${item.name}(${types.join(',')})`);
    if (computed === want) {
      return item.name;
    }
  }
  return undefined;
}

/**
 * Best-effort: well-known 4byte vs Sourcify ABI. A missing well-known selector
 * (approve on a contract whose verified ABI has no approve) or a name collision
 * is `selector_mismatch`. Unknown selectors that are simply absent are ignored.
 */
export function sourcifySelectorMismatch(abi: ABI, selector: string): boolean {
  const abiName = abiFunctionName(abi, selector);
  const known = getSignatureBySelector(selector);
  if (abiName !== undefined) {
    return known !== null && known.name !== abiName;
  }
  return known !== null;
}

export async function appendSecurityWarnings(
  warnings: SecurityWarning[],
  scan: WarningScan,
  options?: DecodeOptions
): Promise<void> {
  const name = operationName(scan.functionName, scan.signature, scan.selector);
  const selector = scan.selector?.toLowerCase();

  if ((name && OWNERSHIP_NAME.test(name)) || (selector && OWNERSHIP_SELECTORS.has(selector))) {
    if (!hasWarning(warnings, 'ownership_change')) {
      warnings.push({
        type: 'ownership_change',
        severity: 'high',
        message: 'This call transfers or changes contract ownership',
      });
    }
  }

  if (
    (name && PROXY_UPGRADE_NAME.test(name)) ||
    (selector && PROXY_UPGRADE_SELECTORS.has(selector))
  ) {
    if (!hasWarning(warnings, 'proxy_upgrade')) {
      warnings.push({
        type: 'proxy_upgrade',
        severity: 'high',
        message: 'This call upgrades a proxy implementation',
      });
    }
  }

  const now = nowSeconds(options);
  const encodingByPath = new Map<string, string>();
  for (const field of scan.fields) {
    if (field.params && typeof field.params.encoding === 'string') {
      encodingByPath.set(field.path, field.params.encoding);
    }
  }
  const deadlineValues = collectNamedValues(scan);
  const deadlineIndex = name ? DEADLINE_ARG_INDEX[name.toLowerCase()] : undefined;
  if (
    deadlineIndex !== undefined &&
    scan.args &&
    !deadlineValues.some((item) => DEADLINE_PATH.test(item.path))
  ) {
    deadlineValues.push({ path: 'deadline', value: scan.args[deadlineIndex] });
  }
  for (const item of deadlineValues) {
    const expired = expiredDeadlineWarning(
      item.path,
      item.value,
      now,
      encodingByPath.get(item.path)
    );
    if (expired && !hasWarning(warnings, 'expired_deadline', expired.path)) {
      warnings.push(expired);
    }
  }

  if (!hasWarning(warnings, 'untrusted_spender') && scan.chainId !== undefined) {
    const spender = await untrustedSpenderWarning(scan, name, scan.chainId, options);
    if (spender) {
      warnings.push(spender);
    }
  }

  if (scan.selectorMismatch && !hasWarning(warnings, 'selector_mismatch')) {
    warnings.push({
      type: 'selector_mismatch',
      severity: 'medium',
      message: 'Sourcify ABI does not match this function selector for the target contract',
    });
  }

  if (
    (scan.source === 'inferred' || scan.source === 'basic') &&
    !hasWarning(warnings, 'missing_metadata')
  ) {
    warnings.push({
      type: 'missing_metadata',
      severity: 'medium',
      message: 'No ERC-7730 descriptor was found for this call',
    });
  }
}

export async function finalizeDecodedWarnings(
  operation: DecodedOperation,
  options: DecodeOptions | undefined,
  extra?: { selectorMismatch?: boolean }
): Promise<DecodedOperation> {
  await appendSecurityWarnings(
    operation.warnings,
    {
      functionName: operation.functionName,
      signature: operation.signature,
      selector: operation.selector,
      fields: operation.fields,
      args: operation.raw.args,
      message: operation.raw.message,
      source: operation.source,
      chainId: operation.metadata.chainId,
      selectorMismatch: extra?.selectorMismatch,
    },
    options
  );
  return operation;
}
