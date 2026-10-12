import { type Hex, zeroAddress, zeroHash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import {
  EAS_CONTRACT,
  ERC8176_SCHEMA_UID,
  type VerifyAttestationContext,
  offchainAttestationUid,
  verifyAttestation,
} from '../attest';
import type { Address } from '../decode/types';

const ATTESTER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const attester = privateKeyToAccount(ATTESTER_KEY);
const OTHER = '0x0000000000000000000000000000000000000001' as Address;
const HASH = `0x${'ab'.repeat(32)}` as Hex;
const OTHER_HASH = `0x${'cd'.repeat(32)}` as Hex;
const SIGNED_TIME = 1_700_000_000n;

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

async function signAttestation(params: {
  data?: Hex;
  time?: bigint;
  expirationTime?: bigint;
  chainId?: number;
  verifyingContract?: Address;
}) {
  const data = params.data ?? HASH;
  const time = params.time ?? SIGNED_TIME;
  const expirationTime = params.expirationTime ?? 0n;
  const chainId = params.chainId ?? 1;
  const verifyingContract = params.verifyingContract ?? EAS_CONTRACT;
  const message = {
    version: 2,
    schema: ERC8176_SCHEMA_UID,
    recipient: zeroAddress,
    time,
    expirationTime,
    revocable: true,
    refUID: zeroHash,
    data,
    salt: `0x${'11'.repeat(32)}` as Hex,
  };
  const uid = offchainAttestationUid({
    schema: message.schema,
    recipient: message.recipient,
    time: message.time,
    expirationTime: message.expirationTime,
    revocable: message.revocable,
    refUID: message.refUID,
    data: message.data,
    salt: message.salt,
  });
  const signature = await attester.signTypedData({
    domain: {
      name: 'EAS Attestation',
      version: '0.26',
      chainId,
      verifyingContract,
    },
    types: ATTEST_TYPES,
    primaryType: 'Attest',
    message,
  });
  return {
    sig: {
      domain: {
        name: 'EAS Attestation',
        version: '0.26',
        chainId,
        verifyingContract,
      },
      primaryType: 'Attest',
      message,
      uid,
      signature,
    },
    signer: attester.address,
  };
}

function context(overrides?: Partial<VerifyAttestationContext>): VerifyAttestationContext {
  return {
    descriptorHash: HASH,
    attesters: [attester.address],
    isRevoked: async () => false,
    ...overrides,
  };
}

describe('verifyAttestation', () => {
  it('accepts a signed ERC-8176 attestation at the injected clock', async () => {
    const raw = await signAttestation({});
    const verdict = await verifyAttestation(raw, context(), SIGNED_TIME);
    expect(verdict).toEqual({ ok: true, reason: 'attested', attester: attester.address });
  });

  it('rejects that attestation when the injected clock is before it was signed', async () => {
    const raw = await signAttestation({});
    const verdict = await verifyAttestation(raw, context(), 1n);
    expect(verdict).toEqual({ ok: false, reason: 'future' });
  });

  it.each([
    ['malformed payload', { raw: null }, 'malformed'],
    ['wrong schema', { patch: 'schema' }, 'schema'],
    ['wrong EAS contract', { patch: 'contract' }, 'verifying_contract'],
    ['wrong chain', { patch: 'chain' }, 'chain_id'],
    ['descriptor hash mismatch', { patch: 'hash' }, 'descriptor_hash'],
    ['uid mismatch', { patch: 'uid' }, 'uid'],
    ['bad signature', { patch: 'signature' }, 'signature'],
  ] as const)('rejects a %s', async (_label, change, reason) => {
    const signed = await signAttestation({});
    let raw: unknown = signed;
    if ('raw' in change) {
      raw = change.raw;
    } else if (change.patch === 'schema') {
      signed.sig.message = { ...signed.sig.message, schema: OTHER_HASH };
    } else if (change.patch === 'contract') {
      signed.sig.domain = { ...signed.sig.domain, verifyingContract: OTHER };
    } else if (change.patch === 'chain') {
      signed.sig.domain = { ...signed.sig.domain, chainId: 10 };
    } else if (change.patch === 'hash') {
      signed.sig.message = { ...signed.sig.message, data: OTHER_HASH };
    } else if (change.patch === 'uid') {
      signed.sig.uid = OTHER_HASH;
    } else if (change.patch === 'signature') {
      signed.sig.signature = `0x${'ab'.repeat(65)}`;
    }
    const verdict = await verifyAttestation(raw, context(), SIGNED_TIME);
    expect(verdict).toEqual({ ok: false, reason });
  });

  it('rejects an attestation that has expired at the injected clock', async () => {
    const raw = await signAttestation({ expirationTime: SIGNED_TIME });
    const verdict = await verifyAttestation(raw, context(), SIGNED_TIME);
    expect(verdict).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a signer outside the trusted attester set', async () => {
    const raw = await signAttestation({});
    const verdict = await verifyAttestation(raw, context({ attesters: [OTHER] }), SIGNED_TIME);
    expect(verdict).toEqual({ ok: false, reason: 'attester' });
  });

  it('rejects a signer hint that disagrees with the recovered attester', async () => {
    const raw = await signAttestation({});
    raw.signer = OTHER;
    const verdict = await verifyAttestation(raw, context(), SIGNED_TIME);
    expect(verdict).toEqual({ ok: false, reason: 'signer_hint' });
  });

  it('rejects a revoked attestation', async () => {
    const raw = await signAttestation({});
    const verdict = await verifyAttestation(
      raw,
      context({ isRevoked: async () => true }),
      SIGNED_TIME
    );
    expect(verdict).toEqual({ ok: false, reason: 'revoked' });
  });

  it('reports a revocation lookup that throws', async () => {
    const raw = await signAttestation({});
    const verdict = await verifyAttestation(
      raw,
      context({
        isRevoked: async () => {
          throw new Error('eas down');
        },
      }),
      SIGNED_TIME
    );
    expect(verdict).toEqual({ ok: false, reason: 'revocation_unavailable' });
  });
});
