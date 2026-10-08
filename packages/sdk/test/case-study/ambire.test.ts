import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearSign } from '../../src/clearSign';
import type { DecodeRegistry } from '../../src/decode/types';
import { resolveDescriptor } from '../../src/resolve';
import type { TransactionInput, TypedDataInput } from '../../src/types';
import type { ResolvedDescriptor } from '../../src/types/descriptor';
import { encodeArgs, encodeCall } from '../golden/encodeCall';
import {
  fileLoader,
  loadManifest,
  loadStagedDescriptor,
  stageCases,
  stagedBaseDir,
} from '../golden/harness';

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as const;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as const;
const UNI_V3 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' as const;
const AAVE = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as const;
const STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as const;
const WSTETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0' as const;
const SAFE = '0x41675C099F32341bf84BFc5382aF534df5C7461a' as const;
const BAYC = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' as const;
const SWELL = '0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0' as const;
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;
const UNIVERSAL = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD' as const;
const UNKNOWN = '0x1111111111111111111111111111111111111111' as const;
const MAX = (1n << 256n) - 1n;

const manifest = loadManifest();
let stageRoot: string;
let registry: DecodeRegistry;

beforeAll(async () => {
  stageRoot = mkdtempSync(join(tmpdir(), 'erc7730-ambire-'));
  stageCases(stageRoot, manifest);
  const byAddress = new Map<string, ResolvedDescriptor>();
  for (const item of manifest.cases) {
    const input = loadStagedDescriptor(stageRoot, item);
    const resolved = await resolveDescriptor(input, fileLoader(stagedBaseDir(stageRoot, item)));
    const tagged = { ...resolved, source: 'official-registry' as const };
    for (const deployment of resolved.deployments) {
      byAddress.set(`${deployment.chainId}:${deployment.address.toLowerCase()}`, tagged);
    }
  }
  registry = {
    async findCalldata(key) {
      return byAddress.get(`${key.chainId}:${key.address.toLowerCase()}`) ?? null;
    },
    async findEip712(key) {
      return byAddress.get(`${key.chainId}:${key.address.toLowerCase()}`) ?? null;
    },
  };
});

afterAll(() => {
  if (stageRoot) {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

interface StudyRow {
  id: string;
  label: string;
  selector: string;
  source: string;
  confidence: string;
  accepted: boolean;
  verification: string;
}

async function row(
  id: string,
  label: string,
  input: TransactionInput | TypedDataInput
): Promise<StudyRow> {
  const signed = await clearSign(input, { registry, provider: null, now: 0 });
  const selector =
    'primaryType' in input
      ? input.primaryType
      : (signed.selector ?? (input.data.length >= 10 ? input.data.slice(0, 10) : input.data));
  return {
    id,
    label,
    selector,
    source: signed.source,
    confidence: signed.confidence,
    accepted: signed.trust.accepted,
    verification: signed.screens.verification,
  };
}

describe('Ambire case study', () => {
  it('scores twenty wallet calls against the vendored pin, offline', async () => {
    const rows = await Promise.all([
      row('eth-transfer', 'ETH transfer', {
        to: VITALIK,
        data: '0x',
        value: 10n ** 18n,
        chainId: 1,
      }),
      row('weth-deposit', 'WETH deposit', {
        to: WETH,
        data: '0xd0e30db0',
        value: 10n ** 18n,
        chainId: 1,
      }),
      row('weth-withdraw', 'WETH withdraw', {
        to: WETH,
        data: encodeCall('withdraw(uint256)'),
        chainId: 1,
      }),
      row('usdc-transfer', 'USDC transfer', {
        to: USDC,
        data: encodeArgs('transfer(address,uint256)', [VITALIK, 100_000_000n]),
        chainId: 1,
      }),
      row('usdt-transfer', 'USDT transfer', {
        to: USDT,
        data: encodeCall('transfer(address,uint256)'),
        chainId: 1,
      }),
      row('usdt-approve', 'USDT approve', {
        to: USDT,
        data: encodeCall('approve(address,uint256)'),
        chainId: 1,
      }),
      row('usdt-infinite', 'USDT infinite approve', {
        to: USDT,
        data: encodeArgs('approve(address,uint256)', [VITALIK, MAX]),
        chainId: 1,
      }),
      row('usdt-transfer-from', 'USDT transferFrom', {
        to: USDT,
        data: encodeCall('transferFrom(address,address,uint256)'),
        chainId: 1,
      }),
      row('uni-v3', 'Uniswap V3 swap', {
        to: UNI_V3,
        data: encodeCall('swapExactTokensForTokens(uint256,uint256,address[],address)'),
        chainId: 1,
      }),
      row('aave-supply', 'Aave supply', {
        to: AAVE,
        data: encodeCall('supply(address,uint256,address,uint16)'),
        chainId: 1,
      }),
      row('lido-submit', 'Lido submit', {
        to: STETH,
        data: encodeCall('submit(address)'),
        value: 10n ** 18n,
        chainId: 1,
      }),
      row('wsteth-wrap', 'wstETH wrap', {
        to: WSTETH,
        data: encodeCall('wrap(uint256)'),
        chainId: 1,
      }),
      row('safe-exec', 'Safe execTransaction', {
        to: SAFE,
        data: encodeCall(
          'execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)'
        ),
        chainId: 1,
      }),
      row('erc721-transfer', 'ERC-721 transferFrom', {
        to: BAYC,
        data: encodeCall('safeTransferFrom(address,address,uint256)'),
        chainId: 1,
      }),
      row('erc721-approval', 'setApprovalForAll', {
        to: BAYC,
        data: encodeCall('setApprovalForAll(address,bool)'),
        chainId: 1,
      }),
      row('permit-usdc', 'USDC Permit', {
        types: {
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        domain: { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: USDC },
        message: {
          owner: VITALIK,
          spender: VITALIK,
          value: 1n,
          nonce: 0n,
          deadline: 0n,
        },
      }),
      row('permit2', 'Permit2 PermitSingle', {
        types: {
          PermitDetails: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' },
          ],
          PermitSingle: [
            { name: 'details', type: 'PermitDetails' },
            { name: 'spender', type: 'address' },
            { name: 'sigDeadline', type: 'uint256' },
          ],
        },
        primaryType: 'PermitSingle',
        domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2 },
        message: {
          details: { token: USDC, amount: 1n, expiration: 0n, nonce: 0n },
          spender: VITALIK,
          sigDeadline: 0n,
        },
      }),
      row('swell-approve', 'Swell approve', {
        to: SWELL,
        data: encodeCall('approve(address,uint256)'),
        chainId: 1,
      }),
      row('universal-router', 'Universal Router', {
        to: UNIVERSAL,
        data: encodeCall('execute(bytes,bytes[])'),
        chainId: 1,
      }),
      row('unknown', 'Unknown contract', {
        to: UNKNOWN,
        data: '0xdeadbeef',
        chainId: 1,
      }),
    ]);

    expect(rows).toHaveLength(20);
    expect(rows.find((item) => item.id === 'weth-deposit')).toMatchObject({
      source: 'official-registry',
      confidence: 'high',
      accepted: true,
      verification: 'verified',
    });
    expect(rows.find((item) => item.id === 'unknown')).toMatchObject({
      verification: 'unverified',
      accepted: false,
    });
    for (const id of ['usdc-transfer', 'erc721-transfer', 'universal-router']) {
      expect(rows.find((item) => item.id === id)?.verification).not.toBe('verified');
    }
    expect(rows.map((item) => item.label).join('\n')).toMatchInlineSnapshot(`
      "ETH transfer
      WETH deposit
      WETH withdraw
      USDC transfer
      USDT transfer
      USDT approve
      USDT infinite approve
      USDT transferFrom
      Uniswap V3 swap
      Aave supply
      Lido submit
      wstETH wrap
      Safe execTransaction
      ERC-721 transferFrom
      setApprovalForAll
      USDC Permit
      Permit2 PermitSingle
      Swell approve
      Universal Router
      Unknown contract"
    `);
    expect(
      rows
        .map(
          (item) =>
            `${item.id} ${item.selector} ${item.source} ${item.confidence} ${item.accepted} ${item.verification}`
        )
        .join('\n')
    ).toMatchInlineSnapshot(`
      "eth-transfer 0x basic low false unverified
      weth-deposit 0xd0e30db0 official-registry high true verified
      weth-withdraw 0x2e1a7d4d builtin low false unverified
      usdc-transfer 0xa9059cbb builtin low false unverified
      usdt-transfer 0xa9059cbb official-registry high true verified
      usdt-approve 0x095ea7b3 official-registry high true verified
      usdt-infinite 0x095ea7b3 official-registry high true verified
      usdt-transfer-from 0x23b872dd builtin low false unverified
      uni-v3 0x472b43f3 official-registry high true verified
      aave-supply 0x617ba037 official-registry high true verified
      lido-submit 0xa1903eab official-registry high true verified
      wsteth-wrap 0xea598cb0 official-registry high true verified
      safe-exec 0x6a761202 official-registry low true verified
      erc721-transfer 0x42842e0e builtin low false unverified
      erc721-approval 0xa22cb465 builtin low false unverified
      permit-usdc Permit official-registry high true verified
      permit2 PermitSingle official-registry high true verified
      swell-approve 0x095ea7b3 official-registry high true verified
      universal-router 0x24856bc3 basic low false unverified
      unknown 0xdeadbeef basic low false unverified"
    `);
  });
});
