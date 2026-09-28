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
} from './generate';
export type {
  GenerateOptions,
  GenerateInput,
  GeneratedDescriptor,
  ABI,
  ABIFunction,
  ABIParameter,
} from './generate';

export { validateDescriptor } from '../schema';
export type {
  ValidationResult,
  ValidationIssue,
  ValidationIssue as ValidationError,
} from '../schema';

export { inferFormat, inferLabel, solidityEnumName, nameTokens } from './inferFormat';
export type { InferredFormat, InferFormatContext } from './inferFormat';
export { inferIntent } from './inferIntent';
