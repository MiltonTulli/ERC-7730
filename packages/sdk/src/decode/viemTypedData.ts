import type { TypedData, TypedDataDefinition } from 'viem';
import { decodeTypedData } from './decodeTypedData';
import type { DecodeOptions, DecodedOperation } from './types';

/** Adapt viem message or domain-only definitions to the core EIP-712 input. */
export function decodeViemTypedData(
  typedData: TypedDataDefinition | TypedDataDefinition<TypedData, 'EIP712Domain'>,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  const domain = typedData.domain ?? {};
  const types = Object.fromEntries(
    Object.entries(typedData.types ?? {}).map(([name, fields]) => [name, [...(fields ?? [])]])
  );
  if (typedData.primaryType === 'EIP712Domain' && !types.EIP712Domain) {
    // Match viem's getTypesForEIP712Domain ordering and presence checks,
    // without introducing a runtime viem import in this adapter.
    const fields = [];
    if (typeof domain.name === 'string') fields.push({ name: 'name', type: 'string' });
    if (domain.version) fields.push({ name: 'version', type: 'string' });
    if (typeof domain.chainId === 'number' || typeof domain.chainId === 'bigint') {
      fields.push({ name: 'chainId', type: 'uint256' });
    }
    if (domain.verifyingContract) fields.push({ name: 'verifyingContract', type: 'address' });
    if (domain.salt) fields.push({ name: 'salt', type: 'bytes32' });
    types.EIP712Domain = fields;
  }
  return decodeTypedData(
    {
      domain,
      types,
      primaryType: typedData.primaryType,
      message:
        typedData.primaryType === 'EIP712Domain'
          ? Object.fromEntries(
              types.EIP712Domain.map(({ name }) => [name, domain[name as keyof typeof domain]])
            )
          : (typedData.message ?? {}),
    },
    options
  );
}
