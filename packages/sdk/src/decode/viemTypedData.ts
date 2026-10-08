import { decodeTypedData } from './decodeTypedData';
import type { DecodeOptions, DecodedOperation } from './types';

/** Domain fields this adapter reads. Extra fields are ignored. */
export interface ViemTypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number | bigint;
  verifyingContract?: `0x${string}`;
  salt?: `0x${string}`;
}

export interface ViemTypedDataParameter {
  readonly name: string;
  readonly type: string;
}

/**
 * Structural EIP-712 input. Callers can pass a wallet typed-data definition
 * without this package naming that wallet library in its types.
 */
export interface ViemTypedDataDefinition {
  domain?: ViemTypedDataDomain;
  types?: Readonly<Record<string, readonly ViemTypedDataParameter[] | undefined>>;
  primaryType: string;
  message?: object;
}

/** Adapt a wallet typed-data definition, including domain-only messages, to the core EIP-712 input. */
export function decodeViemTypedData(
  typedData: ViemTypedDataDefinition,
  options?: DecodeOptions
): Promise<DecodedOperation> {
  const domain = typedData.domain ?? {};
  const types: Record<string, ViemTypedDataParameter[]> = Object.fromEntries(
    Object.entries(typedData.types ?? {}).map(([name, fields]) => [name, [...(fields ?? [])]])
  );
  if (typedData.primaryType === 'EIP712Domain' && !types.EIP712Domain) {
    // Match viem's getTypesForEIP712Domain ordering and presence checks.
    const fields: ViemTypedDataParameter[] = [];
    if (typeof domain.name === 'string') fields.push({ name: 'name', type: 'string' });
    if (domain.version) fields.push({ name: 'version', type: 'string' });
    if (typeof domain.chainId === 'number' || typeof domain.chainId === 'bigint') {
      fields.push({ name: 'chainId', type: 'uint256' });
    }
    if (domain.verifyingContract) fields.push({ name: 'verifyingContract', type: 'address' });
    if (domain.salt) fields.push({ name: 'salt', type: 'bytes32' });
    types.EIP712Domain = fields;
  }
  const domainMessage = Object.fromEntries(
    (types.EIP712Domain ?? []).map(({ name }) => [name, domain[name as keyof typeof domain]])
  );
  return decodeTypedData(
    {
      domain,
      types,
      primaryType: typedData.primaryType,
      message:
        typedData.primaryType === 'EIP712Domain'
          ? domainMessage
          : ((typedData.message ?? {}) as Record<string, unknown>),
    },
    options
  );
}
