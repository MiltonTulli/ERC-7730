import { computeSelector, getSignatureBySelector } from '../core/signatures.js';
import type { ABI, ABIParameter } from '../generate/generate.js';
import type { Hex, ResolvedDescriptor } from '../types/descriptor.js';
import { parseDeclaration, wellKnownAliases } from './abi.js';
import { asAddress, nowSeconds, resolveTrust, sourceFromResolved } from './common.js';
import type {
  Address,
  DecodeOptions,
  DecodeSource,
  DecodedField,
  DecodedOperation,
  SecurityWarning,
  SecurityWarningType,
} from './types.js';

const DEADLINE_PATH = /(?:^|[.[\]])(deadline|expiry|expiration|sigDeadline)$/i;
const SPENDER_PATH = /(?:^|[.[\]])(spender|operator)$/i;
const SPENDER_FUNCTIONS =
  /^(approve|permit|setApprovalForAll|increaseAllowance|decreaseAllowance)$/i;
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

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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
  chainId: number;
  selectorMismatch?: boolean;
}

/** Spender argument index when the display fields omit a named spender. */
const SPENDER_ARG_INDEX: Record<string, number> = {
  approve: 0,
  permit: 1,
  setapprovalforall: 0,
  increaseallowance: 0,
  decreaseallowance: 0,
};

const DEADLINE_ARG_INDEX: Record<string, number> = {
  permit: 3,
};

function hasWarning(
  warnings: SecurityWarning[],
  type: SecurityWarningType,
  path?: string
): boolean {
  return warnings.some(
    (warning) => warning.type === type && (path === undefined || warning.path === path)
  );
}

function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && value !== '') {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function addressOf(value: unknown): Address | undefined {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) {
    return undefined;
  }
  return asAddress(value.toLowerCase());
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

interface NamedValue {
  path: string;
  value: unknown;
}

function collectNamedValues(scan: WarningScan): NamedValue[] {
  const out: NamedValue[] = [];
  const seen = new Set<string>();
  const push = (path: string, value: unknown) => {
    const key = path.toLowerCase();
    if (!path || seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push({ path, value });
  };

  for (const field of scan.fields) {
    push(field.path, field.rawValue);
  }
  if (scan.message) {
    for (const [key, value] of Object.entries(scan.message)) {
      push(key, value);
    }
  }
  if (scan.args) {
    const declaration = scan.signature ? parseDeclaration(scan.signature) : null;
    const aliases = declaration ? wellKnownAliases(declaration.canonical) : undefined;
    for (let i = 0; i < scan.args.length; i++) {
      const name = declaration?.params[i]?.name ?? aliases?.[i];
      if (name) {
        push(name, scan.args[i]);
      }
      push(`[${i}]`, scan.args[i]);
    }
  }
  return out;
}

function expiredDeadlineWarning(
  path: string,
  value: unknown,
  now: number,
  encoding?: string
): SecurityWarning | undefined {
  if (!DEADLINE_PATH.test(path)) {
    return undefined;
  }
  if (encoding === 'blockheight') {
    return undefined;
  }
  const ts = toBigInt(value);
  if (ts === undefined) {
    return undefined;
  }
  if (ts >= BigInt(now)) {
    return undefined;
  }
  return {
    type: 'expired_deadline',
    severity: 'medium',
    message: 'This deadline has already passed',
    path,
  };
}

function spenderFromScan(
  scan: WarningScan,
  functionName?: string
): { address: Address; path: string } | undefined {
  const values = collectNamedValues(scan);
  for (const item of values) {
    if (SPENDER_PATH.test(item.path)) {
      const address = addressOf(item.value);
      if (address) {
        return { address, path: item.path };
      }
    }
  }
  for (const field of scan.fields) {
    if (typeof field.label === 'string' && /^(spender|operator)$/i.test(field.label)) {
      const address = addressOf(field.rawValue);
      if (address) {
        return { address, path: field.path };
      }
    }
  }
  if (!functionName || !SPENDER_FUNCTIONS.test(functionName)) {
    return undefined;
  }
  const index = SPENDER_ARG_INDEX[functionName.toLowerCase()] ?? 0;
  const fromArgs = addressOf(scan.args?.[index]);
  if (fromArgs) {
    return { address: fromArgs, path: `[${index}]` };
  }
  const field = scan.fields[index];
  const fromField = field ? addressOf(field.rawValue) : undefined;
  return field && fromField ? { address: fromField, path: field.path } : undefined;
}

function descriptorCoversAddress(
  resolved: ResolvedDescriptor,
  chainId: number,
  address: Address
): boolean {
  if (resolved.deployments.length === 0) {
    return true;
  }
  const want = address.toLowerCase();
  return resolved.deployments.some(
    (item) => item.chainId === chainId && item.address.toLowerCase() === want
  );
}

async function lookupSpender(
  spender: Address,
  chainId: number,
  options: DecodeOptions | undefined
): Promise<ResolvedDescriptor | null> {
  const registry = options?.registry;
  if (!registry) {
    return null;
  }
  const key = {
    chainId,
    address: spender,
    provider: options?.provider,
    fromBlock: options?.fromBlock,
    toBlock: options?.toBlock,
  };
  try {
    const found = await registry.findCalldata(key);
    if (found && descriptorCoversAddress(found, chainId, spender)) {
      return found;
    }
  } catch {
    // Spender lookup must not fail decode.
  }
  const findEip712 = registry.findEip712;
  if (typeof findEip712 !== 'function') {
    return null;
  }
  try {
    const found = await findEip712.call(registry, key);
    if (found && descriptorCoversAddress(found, chainId, spender)) {
      return found;
    }
  } catch {
    return null;
  }
  return null;
}

function allowlistedSpender(spender: Address, options: DecodeOptions | undefined): boolean {
  const list = options?.spenderAllowlist;
  if (!list || list.length === 0) {
    return false;
  }
  const want = spender.toLowerCase();
  return list.some((entry) => entry.toLowerCase() === want);
}

async function untrustedSpenderWarning(
  scan: WarningScan,
  functionName: string | undefined,
  chainId: number,
  options: DecodeOptions | undefined
): Promise<SecurityWarning | undefined> {
  const spender = spenderFromScan(scan, functionName);
  if (!spender) {
    return undefined;
  }
  if (allowlistedSpender(spender.address, options)) {
    return undefined;
  }
  const found = await lookupSpender(spender.address, chainId, options);
  if (found) {
    const source = sourceFromResolved(found);
    const trust = await resolveTrust(options, source, found, chainId, spender.address);
    if (trust.accepted) {
      return undefined;
    }
  } else {
    const trust = await resolveTrust(options, 'inferred', undefined, chainId, spender.address);
    if (trust.accepted) {
      return undefined;
    }
  }
  return {
    type: 'untrusted_spender',
    severity: 'high',
    message: 'Spender is not in the registry or was not accepted by the trust policy',
    path: spender.path,
  };
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

  if (!hasWarning(warnings, 'untrusted_spender')) {
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
