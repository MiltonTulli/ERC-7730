import {
  type Hex,
  encodeFunctionData,
  encodePacked,
  hexToBigInt,
  isAddress,
  isHex,
  keccak256,
  recoverTypedDataAddress,
  stringToHex,
  zeroAddress,
  zeroHash,
} from 'viem';
import type { Address, TrustContext, TrustPolicy, TrustReport } from '../decode/types.js';
import { isPlainObject } from '../resolve/util.js';

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

function parseAttestation(raw: unknown): ParsedAttestation | null {
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
          reasons: ['ATTESTATION_OPTIONS_INCOMPLETE', 'NO_TRUSTED_ATTESTATION'],
        };
      }
      if (!ctx.descriptor || !descriptorHash) {
        return {
          ...base,
          accepted: false,
          reasons: ['NO_TRUSTED_ATTESTATION'],
        };
      }

      const allowed = new Set(attesters.map((item) => item.toLowerCase()));
      const rawList = ctx.descriptor.attestations ?? [];
      const now = BigInt(Math.floor(Date.now() / 1000));

      for (const raw of rawList) {
        const attestation = parseAttestation(raw);
        if (!attestation) {
          continue;
        }
        if (attestation.schema.toLowerCase() !== ERC8176_SCHEMA_UID.toLowerCase()) {
          continue;
        }
        if (attestation.verifyingContract.toLowerCase() !== EAS_CONTRACT.toLowerCase()) {
          continue;
        }
        if (attestation.chainId !== EAS_CHAIN_ID) {
          continue;
        }
        const hashInData = descriptorHashFromData(attestation.data);
        if (!hashInData || hashInData !== descriptorHash.toLowerCase()) {
          continue;
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
          continue;
        }
        if (attestation.expirationTime !== 0n && attestation.expirationTime <= now) {
          continue;
        }
        if (attestation.time > now + 60n) {
          continue;
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
          continue;
        }

        if (!allowed.has(signer.toLowerCase())) {
          continue;
        }
        if (
          attestation.signerHint &&
          attestation.signerHint.toLowerCase() !== signer.toLowerCase()
        ) {
          continue;
        }

        try {
          if (await isRevoked(easCall, signer, attestation.uid)) {
            continue;
          }
        } catch {
          return {
            ...base,
            accepted: false,
            reasons: ['ATTESTATION_OPTIONS_INCOMPLETE', 'NO_TRUSTED_ATTESTATION'],
          };
        }

        return {
          accepted: true,
          policy: 'attested',
          descriptorHash,
          attesters: [signer],
          reasons: ['ATTESTED'],
        };
      }

      return {
        ...base,
        accepted: false,
        reasons: ['NO_TRUSTED_ATTESTATION'],
      };
    },
  };
}
