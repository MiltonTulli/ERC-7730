import { type Hex, zeroAddress, zeroHash } from 'viem';
import { isAddress, isHex } from 'viem/utils';
import type { Address } from './decode/types';
import { isPlainObject } from './resolve/util';

interface ParsedAttestation {
  uid: Hex;
  schema: Hex;
  recipient: Address;
  time: bigint;
  expirationTime: bigint;
  revocable: boolean;
  refUID: Hex;
  data: Hex;
  salt: Hex;
  version: number;
  domainVersion: string;
  verifyingContract: Address;
  chainId: number;
  signature: Hex;
  signerHint?: Address;
}

function asHex32(value: unknown): Hex | undefined {
  if (typeof value !== 'string' || !isHex(value) || value.length !== 66) {
    return undefined;
  }
  return value.toLowerCase() as Hex;
}

function asAddress(value: unknown): Address | undefined {
  if (typeof value !== 'string' || !isAddress(value)) {
    return undefined;
  }
  return value as Address;
}

function asUint(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && value !== '') {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function signatureToHex(value: unknown): Hex | undefined {
  if (typeof value === 'string' && isHex(value) && value.length === 132) {
    return value;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const r = typeof value.r === 'string' ? value.r : undefined;
  const s = typeof value.s === 'string' ? value.s : undefined;
  const vRaw = value.v;
  if (!r || !s || !isHex(r) || !isHex(s)) {
    return undefined;
  }
  let v = typeof vRaw === 'number' ? vRaw : typeof vRaw === 'bigint' ? Number(vRaw) : undefined;
  if (v === undefined && typeof vRaw === 'string') {
    try {
      v = Number(BigInt(vRaw));
    } catch {
      return undefined;
    }
  }
  if (v === undefined) {
    return undefined;
  }
  if (v < 27) {
    v += 27;
  }
  const vHex = v.toString(16).padStart(2, '0');
  return `${r}${s.slice(2)}${vHex}` as Hex;
}

export function parseAttestation(raw: unknown): ParsedAttestation | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const sig = isPlainObject(raw.sig) ? raw.sig : raw;
  if (!isPlainObject(sig)) {
    return null;
  }
  const message = isPlainObject(sig.message) ? sig.message : null;
  const domain = isPlainObject(sig.domain) ? sig.domain : null;
  if (!message || !domain) {
    return null;
  }

  const uid = asHex32(sig.uid);
  const schema = asHex32(message.schema);
  const recipient = asAddress(message.recipient) ?? (zeroAddress as Address);
  const time = asUint(message.time);
  const expirationTime = asUint(message.expirationTime);
  const refUID = asHex32(message.refUID) ?? (zeroHash as Hex);
  const salt = asHex32(message.salt) ?? (zeroHash as Hex);
  const data =
    typeof message.data === 'string' && isHex(message.data) ? (message.data as Hex) : undefined;
  const version = Number(message.version ?? 2);
  const signature = signatureToHex(sig.signature);
  const verifyingContract = asAddress(domain.verifyingContract);
  const chainId = asUint(domain.chainId);
  const domainVersion = typeof domain.version === 'string' ? domain.version : undefined;
  const signerHint = asAddress(raw.signer) ?? asAddress(sig.attester);

  if (
    !uid ||
    !schema ||
    time === undefined ||
    expirationTime === undefined ||
    !data ||
    !signature ||
    !verifyingContract ||
    chainId === undefined ||
    !domainVersion ||
    version !== 2
  ) {
    return null;
  }

  return {
    uid,
    schema,
    recipient,
    time,
    expirationTime,
    revocable: Boolean(message.revocable),
    refUID,
    data,
    salt,
    version,
    domainVersion,
    verifyingContract,
    chainId: Number(chainId),
    signature,
    signerHint,
  };
}

/**
 * EAS offchain UID for version 2. Schema is hashed as UTF-8 of the hex string,
 * matching `@ethereum-attestation-service/eas-sdk`.
 */
