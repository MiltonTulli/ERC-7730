/**
 * `TRUST_REASON_CODES` is the frozen list. `TrustReasonCode` is the union.
 * Adding a member to only one of them fails this file.
 * Run via `pnpm --filter @erc7730/sdk typecheck:consumer` after the SDK build.
 */

import type { TRUST_REASON_CODES, TrustReasonCode, TrustReport } from '@erc7730/sdk';

type Assert<T extends true> = T;

type Listed = (typeof TRUST_REASON_CODES)[number];
type MissingFromArray = Exclude<TrustReasonCode, Listed>;
type ExtraInArray = Exclude<Listed, TrustReasonCode>;

type CodesAreReadonly = Assert<
  typeof TRUST_REASON_CODES extends readonly TrustReasonCode[] ? true : false
>;
type ArrayCoversUnion = Assert<MissingFromArray extends never ? true : false>;
type UnionCoversArray = Assert<ExtraInArray extends never ? true : false>;
type ReportReasons = Assert<TrustReport['reasons'][number] extends TrustReasonCode ? true : false>;

const codesAreReadonly: CodesAreReadonly = true;
const arrayCoversUnion: ArrayCoversUnion = true;
const unionCoversArray: UnionCoversArray = true;
const reportReasons: ReportReasons = true;

void codesAreReadonly;
void arrayCoversUnion;
void unionCoversArray;
void reportReasons;
