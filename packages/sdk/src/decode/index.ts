export { decodeTransaction } from './decodeTransaction.js';
export { decodeTypedData } from './decodeTypedData.js';
export { resolvePath, PathResolveError } from './path.js';
export { matchFormat } from './match.js';
export { canonicalizeDeclaration, parseDeclaration } from './abi.js';

export type {
  Address,
  Confidence,
  DecodedField,
  DecodedOperation,
  DecodeOptions,
  DecodeRegistry,
  DecodeSource,
  FieldFormat,
  SecurityWarning,
  TrustContext,
  TrustPolicy,
  TrustReport,
  TypedDataInput,
} from './types.js';

export type { PathContext, PathEnvelope } from './path.js';
export type { MatchedFormat } from './match.js';
export type { ParsedDeclaration, ParsedParam } from './abi.js';
