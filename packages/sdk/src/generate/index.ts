/**
 * ERC-7730 Descriptor Generation
 */

export {
  generateDescriptor,
  generateFunctionDescriptor,
  looksLikeErc20,
  asInputDescriptor,
  V2_SCHEMA_URI,
  GENERATED_DESCRIPTOR_COMMENT,
} from './generate.js';
export type {
  GenerateOptions,
  GenerateInput,
  GeneratedDescriptor,
  ABI,
  ABIFunction,
  ABIParameter,
} from './generate.js';

export { validateDescriptor } from '../schema/index.js';
export type {
  ValidationResult,
  ValidationIssue,
  ValidationIssue as ValidationError,
} from '../schema/index.js';

export { inferFormat, inferLabel, solidityEnumName, nameTokens } from './inferFormat.js';
export type { InferredFormat, InferFormatContext } from './inferFormat.js';
export { inferIntent } from './inferIntent.js';
