import { Erc7730Error } from '../errors';
import type { ValidationIssue } from '../types/descriptor';

export type DescriptorResolveErrorCode =
  | 'VALIDATION_FAILED'
  | 'INCLUDE_NOT_FOUND'
  | 'INCLUDE_CYCLE'
  | 'INCLUDE_DEPTH'
  | 'REF_NOT_FOUND';

export class DescriptorResolveError extends Erc7730Error {
  readonly path?: string;
  readonly issues: readonly ValidationIssue[];
  override readonly code: DescriptorResolveErrorCode;

  constructor(
    code: DescriptorResolveErrorCode,
    message: string,
    options?: { path?: string; issues?: readonly ValidationIssue[]; cause?: unknown }
  ) {
    super(code, options?.path ? `${options.path}: ${message}` : message, options);
    this.code = code;
    this.path = options?.path;
    this.issues = options?.issues ?? [];
  }
}

export function invalidDescriptors(
  index: number,
  issues: readonly ValidationIssue[]
): DescriptorResolveError {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  return new DescriptorResolveError(
    'VALIDATION_FAILED',
    details.length > 0
      ? `Invalid descriptor at index ${index}: ${details}`
      : `Invalid descriptor at index ${index}`,
    { path: issues[0]?.path, issues }
  );
}
