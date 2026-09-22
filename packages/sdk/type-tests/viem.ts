import type { DecodeOptions, DecodedOperation } from '@erc7730/sdk';
import {
  type ViemTransactionInput,
  decodeViemTransaction,
  decodeViemTypedData,
} from '@erc7730/sdk/viem';
import type { TransactionRequest, TypedDataDefinition } from 'viem';

const address = '0x1111111111111111111111111111111111111111' as const;
const options: DecodeOptions = { provider: null, useSourcifyFallback: false };
const types = {
  Mail: [{ name: 'contents', type: 'string' }],
} as const;
const message: TypedDataDefinition<typeof types, 'Mail'> = {
  types,
  primaryType: 'Mail',
  message: { contents: 'Hello' },
};
// biome-ignore lint/complexity/noBannedTypes: Regress viem's valid empty-schema domain definition exactly.
const domainOnly: TypedDataDefinition<{}, 'EIP712Domain'> = {
  primaryType: 'EIP712Domain',
  domain: { chainId: 1n, verifyingContract: address },
};
const domainTypes = { EIP712Domain: [{ name: 'name', type: 'string' }] } as const;
const explicitDomain: TypedDataDefinition<typeof domainTypes, 'EIP712Domain'> = {
  types: domainTypes,
  primaryType: 'EIP712Domain',
  domain: { name: 'Example' },
};
const transaction = {
  to: address,
  data: '0x12345678',
  chainId: 1,
  value: 1n,
  from: address,
} as const satisfies TransactionRequest & ViemTransactionInput;

export const results: Promise<DecodedOperation>[] = [
  decodeViemTypedData(message, options),
  decodeViemTypedData(domainOnly, options),
  decodeViemTypedData(explicitDomain, options),
  decodeViemTransaction(transaction, options),
];
