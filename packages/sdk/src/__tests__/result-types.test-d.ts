import { expectTypeOf } from 'vitest';
import type { DecodedField, DecodedOperation, SecurityWarning } from '../decode/types';

expectTypeOf<DecodedOperation['fields'][number]>().toEqualTypeOf<DecodedField>();
expectTypeOf<DecodedOperation['warnings'][number]>().toEqualTypeOf<SecurityWarning>();
