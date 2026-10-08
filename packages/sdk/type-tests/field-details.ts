import type { DecodedField } from '@erc7730/sdk';

function assertNever(value: never): never {
  throw new Error(String(value));
}

/** Exhaustive switch on `field.format`. A new format must update this function. */
export function readDetails(field: DecodedField): bigint | string | number | undefined {
  switch (field.format) {
    case 'tokenAmount':
      return field.details.amount;
    case 'addressName':
      return field.details.address;
    case 'date':
      return field.details.timestamp;
    case 'enum':
      return field.details.resolved ?? field.details.raw;
    case 'nftName':
      return field.details.tokenId;
    case 'calldata':
      return field.details.embedded.intent;
    case 'raw':
    case 'amount':
    case 'duration':
    case 'unit':
    case 'chainId':
    case 'tokenTicker':
      return typeof field.details.raw === 'string' ? field.details.raw : undefined;
    default:
      return assertNever(field);
  }
}
