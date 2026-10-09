import type {
  DecodeSource,
  DecodedOperation,
  SecurityWarning,
  SecurityWarningType,
} from './decode/types';

export interface ScreenField {
  label: string;
  value: string;
  path?: string;
}

export interface ScreenRisk {
  severity: SecurityWarning['severity'];
  type: SecurityWarningType;
  message: string;
  path?: string;
}

export type ScreenVerification = 'verified' | 'unverified' | 'rejected';

export interface ClearSignScreens {
  headline: string;
  verification: ScreenVerification;
  verificationLabel: string;
  primary: ScreenField[];
  secondary: ScreenField[];
  risks: ScreenRisk[];
  children?: ClearSignScreens[];
}

export interface ToScreensOptions {
  /** Prefixed to the headline when verification is not `verified`. */
  unverifiedPrefix?: string;
}

const SEVERITY_RANK: Record<SecurityWarning['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const DEFAULT_PREFIX = 'Unverified: ';

export function screenVerification(operation: DecodedOperation): ScreenVerification {
  const curated =
    operation.source === 'official-registry' ||
    operation.source === 'attested' ||
    operation.source === 'local-override';
  if (
    operation.trust.accepted &&
    (operation.source === 'official-registry' || operation.source === 'attested')
  ) {
    return 'verified';
  }
  if (!operation.trust.accepted && curated) {
    return 'rejected';
  }
  return 'unverified';
}

function verificationLabel(verification: ScreenVerification, source: DecodeSource): string {
  if (verification === 'verified') {
    return 'Verified by ERC-7730 registry';
  }
  if (verification === 'rejected') {
    return 'Rejected by trust policy';
  }
  switch (source) {
    case 'builtin':
      return 'Unverified: built-in template';
    case 'trusted-token':
      return 'Unverified: token template';
    case 'local-override':
      return 'Unverified: local descriptor';
    case 'sourcify':
    case 'generated':
    case 'inferred':
    case 'basic':
      return 'Unverified: ABI inference';
    default:
      return 'Unverified: ABI inference';
  }
}

function screenField(label: string, value: string, path?: string): ScreenField {
  return path ? { label, value, path } : { label, value };
}

/**
 * Turn a decoded operation into the blocks a wallet confirmation screen shows.
 * Pure: no network, no registry. `field.value` is what the rows display.
 */
export function toScreens(
  operation: DecodedOperation,
  options?: ToScreensOptions
): ClearSignScreens {
  const verification = screenVerification(operation);
  const prefix = options?.unverifiedPrefix ?? DEFAULT_PREFIX;
  const base =
    operation.interpolatedIntent ??
    operation.intent ??
    operation.functionName ??
    'Contract interaction';
  const headline =
    verification === 'verified' || base.startsWith(prefix) ? base : `${prefix}${base}`;

  const primary: ScreenField[] = [];
  const secondary: ScreenField[] = [];
  if (verification !== 'verified') {
    const to = operation.metadata.contractAddress;
    if (to) {
      primary.push(screenField('To', to, '@.to'));
    }
    if (operation.selector) {
      primary.push(screenField('Selector', operation.selector, '@.selector'));
    }
  }
  for (const field of operation.fields) {
    if (field.hidden) {
      continue;
    }
    const row = screenField(field.label, field.value, field.path || undefined);
    if (field.required === true) {
      primary.push(row);
    } else {
      secondary.push(row);
    }
  }

  const risks: ScreenRisk[] = [...operation.warnings]
    .sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity])
    .map((warning) => ({
      severity: warning.severity,
      type: warning.type,
      message: warning.message,
      ...(warning.path ? { path: warning.path } : {}),
    }));

  const children = operation.children?.map((child) => toScreens(child, options));
  return {
    headline,
    verification,
    verificationLabel: verificationLabel(verification, operation.source),
    primary,
    secondary,
    risks,
    ...(children && children.length > 0 ? { children } : {}),
  };
}

/** Plain-text render used by screen goldens. Exact, including blank-line-free rows. */
export function renderScreensText(screens: ClearSignScreens, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines = [`${pad}${screens.verificationLabel}`, `${pad}${screens.headline}`];
  if (screens.primary.length > 0) {
    lines.push(`${pad}Primary:`);
    for (const field of screens.primary) {
      lines.push(`${pad}  ${field.label}: ${field.value}`);
    }
  }
  if (screens.secondary.length > 0) {
    lines.push(`${pad}Secondary:`);
    for (const field of screens.secondary) {
      lines.push(`${pad}  ${field.label}: ${field.value}`);
    }
  }
  if (screens.risks.length > 0) {
    lines.push(`${pad}Risks:`);
    for (const risk of screens.risks) {
      lines.push(`${pad}  [${risk.severity}] ${risk.type}: ${risk.message}`);
    }
  }
  if (screens.children) {
    for (const child of screens.children) {
      lines.push(renderScreensText(child, indent + 1));
    }
  }
  return lines.join('\n');
}
