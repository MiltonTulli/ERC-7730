/**
 * The public result types are the ones on `DecodedOperation`.
 * Run via `pnpm --filter @erc7730/sdk typecheck:consumer` after the SDK build.
 */

import type { DecodedField, DecodedOperation, SecurityWarning } from '@erc7730/sdk';

type AssertEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

type FieldsMatch = AssertEqual<DecodedOperation['fields'][number], DecodedField>;
type WarningsMatch = AssertEqual<DecodedOperation['warnings'][number], SecurityWarning>;

const fieldsMatch: FieldsMatch = true;
const warningsMatch: WarningsMatch = true;

void fieldsMatch;
void warningsMatch;
