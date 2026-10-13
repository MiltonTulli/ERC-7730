import { type Hex, zeroAddress } from 'viem';
import {
  encodeFunctionData,
  encodePacked,
  hexToBigInt,
  isHex,
  keccak256,
  recoverTypedDataAddress,
  stringToHex,
} from 'viem/utils';
import { parseAttestation } from './attestParse';
import type { Address, TrustContext, TrustPolicy, TrustReport } from './decode/types';

/** ERC-8176 schema UID on Ethereum mainnet (`bytes32 descriptorHash`). */
export const ERC8176_SCHEMA_UID =
  '0xe023eef113c1670774801c34b377fdf612dd8a4d2fa92fe382e15bd91fafb5c2' as const;

/** EAS contract on Ethereum mainnet. */
export const EAS_CONTRACT = '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587' as const;

export const EAS_CHAIN_ID = 1;

const ATTEST_TYPES = {
  Attest: [
    { name: 'version', type: 'uint16' },
    { name: 'schema', type: 'bytes32' },
    { name: 'recipient', type: 'address' },
    { name: 'time', type: 'uint64' },
    { name: 'expirationTime', type: 'uint64' },
    { name: 'revocable', type: 'bool' },
    { name: 'refUID', type: 'bytes32' },
    { name: 'data', type: 'bytes' },
    { name: 'salt', type: 'bytes32' },
  ],
} as const;

const REVOKE_ABI = [
  {
    type: 'function',
    name: 'getRevokeOffchain',
    stateMutability: 'view',
    inputs: [
      { name: 'revoker', type: 'address' },
      { name: 'data', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'uint64' }],
  },
] as const;

export interface AttestedPolicyConfig {
  attesters: Address[];
  /**
   * eth_call used to read EAS `revokeOffchain` on mainnet.
   * Required; missing options fail closed.
   */
  eas?: {
    call: (chainId: number, req: { to: Address; data: Hex }) => Promise<Hex>;
  };
}

export interface VerifyAttestationContext {
  /** Descriptor hash the attestation data must commit to. */
  descriptorHash: Hex;
  attesters: readonly Address[];
  /** Reads EAS `getRevokeOffchain`. A throw is `revocation_unavailable`. */
  isRevoked(attester: Address, uid: Hex): Promise<boolean>;
}

export type AttestationVerdict =
  | { ok: true; reason: 'attested'; attester: Address }
  | {
      ok: false;
      reason:
        | 'malformed'
        | 'schema'
        | 'verifying_contract'
        | 'chain_id'
        | 'descriptor_hash'
        | 'uid'
        | 'expired'
        | 'future'
        | 'signature'
        | 'attester'
        | 'signer_hint'
        | 'revoked'
        | 'revocation_unavailable';
    };

/**
 * EAS offchain UID for version 2. Schema is hashed as UTF-8 of the hex string,
 * matching `@ethereum-attestation-service/eas-sdk`.
 */
export function offchainAttestationUid(params: {
  schema: Hex;
  recipient: Address;
  time: bigint;
  expirationTime: bigint;
  revocable: boolean;
  refUID: Hex;
  data: Hex;
  salt: Hex;
}): Hex {
  return keccak256(
    encodePacked(
      [
        'uint16',
        'bytes',
        'address',
        'address',
        'uint64',
        'uint64',
        'bool',
        'bytes32',
        'bytes',
        'bytes32',
        'uint32',
      ],
      [
        2,
        stringToHex(params.schema),
        params.recipient,
        zeroAddress,
        params.time,
        params.expirationTime,
        params.revocable,
        params.refUID,
        params.data,
        params.salt,
        0,
      ]
    )
  );
}

function descriptorHashFromData(data: Hex): Hex | undefined {
  if (data.length === 66) {
    return data.toLowerCase() as Hex;
  }
  if (data.length === 130) {
    // abi.encode(bytes32) is a 32-byte word.
    return `0x${data.slice(2, 66)}`.toLowerCase() as Hex;
  }
  return undefined;
}

function uniqueLower(addresses: Address[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const value of addresses) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}

async function isRevoked(
  call: NonNullable<AttestedPolicyConfig['eas']>['call'],
  attester: Address,
  uid: Hex
): Promise<boolean> {
  const data = encodeFunctionData({
    abi: REVOKE_ABI,
    functionName: 'getRevokeOffchain',
    args: [attester, uid],
  });
  const result = await call(EAS_CHAIN_ID, { to: EAS_CONTRACT as Address, data });
  if (!isHex(result) || result === '0x') {
    return true;
  }
  try {
    return hexToBigInt(result) > 0n;
  } catch {
    return true;
  }
}

/**
 * Check one raw ERC-8176 offchain attestation.
 * `now` is unix seconds. The caller supplies the clock; this does not read `Date`.
 */
export async function verifyAttestation(
  raw: unknown,
  ctx: VerifyAttestationContext,
  now: bigint
): Promise<AttestationVerdict> {
  const attestation = parseAttestation(raw);
  if (!attestation) {
    return { ok: false, reason: 'malformed' };
  }
  if (attestation.schema.toLowerCase() !== ERC8176_SCHEMA_UID.toLowerCase()) {
    return { ok: false, reason: 'schema' };
  }
  if (attestation.verifyingContract.toLowerCase() !== EAS_CONTRACT.toLowerCase()) {
    return { ok: false, reason: 'verifying_contract' };
  }
  if (attestation.chainId !== EAS_CHAIN_ID) {
    return { ok: false, reason: 'chain_id' };
  }
  const hashInData = descriptorHashFromData(attestation.data);
  if (!hashInData || hashInData !== ctx.descriptorHash.toLowerCase()) {
    return { ok: false, reason: 'descriptor_hash' };
  }
  const expectedUid = offchainAttestationUid({
    schema: attestation.schema,
    recipient: attestation.recipient,
    time: attestation.time,
    expirationTime: attestation.expirationTime,
    revocable: attestation.revocable,
    refUID: attestation.refUID,
    data: attestation.data,
    salt: attestation.salt,
  });
  if (expectedUid.toLowerCase() !== attestation.uid.toLowerCase()) {
    return { ok: false, reason: 'uid' };
  }
  if (attestation.expirationTime !== 0n && attestation.expirationTime <= now) {
    return { ok: false, reason: 'expired' };
  }
  if (attestation.time > now + 60n) {
    return { ok: false, reason: 'future' };
  }

  let signer: Address;
  try {
    signer = (await recoverTypedDataAddress({
      domain: {
        name: 'EAS Attestation',
        version: attestation.domainVersion,
        chainId: attestation.chainId,
        verifyingContract: attestation.verifyingContract,
      },
      types: ATTEST_TYPES,
      primaryType: 'Attest',
      message: {
        version: attestation.version,
        schema: attestation.schema,
        recipient: attestation.recipient,
        time: attestation.time,
        expirationTime: attestation.expirationTime,
        revocable: attestation.revocable,
        refUID: attestation.refUID,
        data: attestation.data,
        salt: attestation.salt,
      },
      signature: attestation.signature,
    })) as Address;
  } catch {
    return { ok: false, reason: 'signature' };
  }

  const allowed = new Set(ctx.attesters.map((item) => item.toLowerCase()));
  if (!allowed.has(signer.toLowerCase())) {
    return { ok: false, reason: 'attester' };
  }
  if (attestation.signerHint && attestation.signerHint.toLowerCase() !== signer.toLowerCase()) {
    return { ok: false, reason: 'signer_hint' };
  }

  try {
    if (await ctx.isRevoked(signer, attestation.uid)) {
      return { ok: false, reason: 'revoked' };
    }
  } catch {
    return { ok: false, reason: 'revocation_unavailable' };
  }

  return { ok: true, reason: 'attested', attester: signer };
}

/**
 * Accept a descriptor only when a trusted attester has a valid ERC-8176
 * offchain EAS v2 attestation for `descriptor.hash`. Does not issue attestations.
 */
export function attestedPolicy(config: AttestedPolicyConfig): TrustPolicy {
  const attesters = uniqueLower(config.attesters ?? []);
  const easCall = config.eas?.call;

  return {
    id: 'attested',
    async evaluate(ctx: TrustContext): Promise<TrustReport> {
      const descriptorHash = ctx.descriptor?.hash;
      const base = {
        policy: 'attested' as const,
        descriptorHash,
      };

      if (!easCall || attesters.length === 0) {
        return {
          ...base,
          accepted: false,
          reasons: ['attestation_options_incomplete', 'no_trusted_attestation'],
        };
      }
      if (!ctx.descriptor || !descriptorHash) {
        return {
          ...base,
          accepted: false,
          reasons: ['no_trusted_attestation'],
        };
      }

      const rawList = ctx.descriptor.attestations ?? [];
      const clock =
        typeof ctx.now === 'number' && Number.isFinite(ctx.now)
          ? Math.trunc(ctx.now)
          : Math.floor(Date.now() / 1000);
      const now = BigInt(clock);

      for (const raw of rawList) {
        const verdict = await verifyAttestation(
          raw,
          {
            descriptorHash,
            attesters,
            isRevoked: (signer, uid) => isRevoked(easCall, signer, uid),
          },
          now
        );
        if (verdict.reason === 'revocation_unavailable') {
          return {
            ...base,
            accepted: false,
            reasons: ['attestation_options_incomplete', 'no_trusted_attestation'],
          };
        }
        if (!verdict.ok) {
          continue;
        }
        return {
          accepted: true,
          policy: 'attested',
          descriptorHash,
          attesters: [verdict.attester],
          reasons: ['attested'],
        };
      }

      return {
        ...base,
        accepted: false,
        reasons: ['no_trusted_attestation'],
      };
    },
  };
}
