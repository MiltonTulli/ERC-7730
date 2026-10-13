import type { DecodedOperation } from '../../src/decode/types';
import type { ClearSignScreens } from '../../src/screens';
import type { TypedDataInput } from '../../src/types';
import type {
  IncludeLoader,
  InputDescriptor,
  ResolvedDescriptor,
} from '../../src/types/descriptor';
import { encodeCall } from './encodeCall';

const ZERO = '0x0000000000000000000000000000000000000000' as const;

/** Shortest stable format on each vendored descriptor. */
const FORMAT_PREFIX: Record<string, string> = {
  'weth-calldata-weth': 'deposit()',
  'aave-calldata-lpv3': 'supply(address',
  'lido-calldata-stETH': 'submit(address',
  'lido-calldata-wstETH': 'wrap(uint256',
  'tether-calldata-usdt': 'transfer(address',
  'uniswap-calldata-UniswapV3Router02': 'swapExactTokensForTokens(',
  'swell-calldata-swell': 'approve(address spender',
  'ethena-calldata-ethena': 'unstake(address',
  'safe-calldata-Safe-1.4.1': 'changeThreshold(uint256',
};

const WITH_VALUE = new Set(['weth-calldata-weth', 'lido-calldata-stETH']);

export interface GoldenSdk {
  resolveDescriptor: (input: InputDescriptor, loader: IncludeLoader) => Promise<ResolvedDescriptor>;
  decodeTransaction: (
    tx: { to: string; data: `0x${string}`; chainId: number; value?: bigint },
    options: {
      registry: DecodeRegistry;
      provider: null;
      now: number;
    }
  ) => Promise<DecodedOperation>;
  decodeTypedData: (
    data: TypedDataInput,
    options: {
      registry: DecodeRegistry;
      provider: null;
      now: number;
    }
  ) => Promise<DecodedOperation>;
  toScreens: (operation: DecodedOperation) => ClearSignScreens;
  renderScreensText: (screens: ClearSignScreens) => string;
}

interface DecodeRegistry {
  findCalldata: () => Promise<ResolvedDescriptor & { source: 'official-registry' }>;
  findEip712: () => Promise<ResolvedDescriptor & { source: 'official-registry' }>;
}

export interface GoldenCaseRef {
  id: string;
  kind: 'calldata' | 'eip712';
}

function formatsOf(merged: InputDescriptor): Record<string, unknown> {
  const display = merged.display as { formats?: Record<string, unknown> } | undefined;
  return display?.formats ?? {};
}

function pickFormat(id: string, merged: InputDescriptor): string {
  const prefix = FORMAT_PREFIX[id];
  if (!prefix) {
    throw new Error(`No format prefix for ${id}`);
  }
  const key = Object.keys(formatsOf(merged)).find((item) => item.startsWith(prefix));
  if (!key) {
    throw new Error(`${id} has no format starting with ${prefix}`);
  }
  return key;
}

function domainOf(merged: InputDescriptor): Record<string, unknown> {
  const context = merged.context as { eip712?: { domain?: Record<string, unknown> } } | undefined;
  return context?.eip712?.domain ?? {};
}

function typedSample(id: string, resolved: ResolvedDescriptor): TypedDataInput {
  const deployment = resolved.deployments[0];
  if (!deployment) {
    throw new Error(`${id} has no deployment`);
  }
  const domainFields = domainOf(resolved.merged);
  const domain = {
    ...domainFields,
    chainId: deployment.chainId,
    verifyingContract: deployment.address,
  };
  if (id === 'permit-eip712-ethereum-usdc') {
    return {
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
      domain,
      message: { owner: ZERO, spender: ZERO, value: 0n, nonce: 0n, deadline: 0n },
    };
  }
  return {
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
    domain,
    message: {
      details: { token: ZERO, amount: 0n, expiration: 0n, nonce: 0n },
      spender: ZERO,
      sigDeadline: 0n,
    },
  };
}

function registryOf(resolved: ResolvedDescriptor): DecodeRegistry {
  const tagged = { ...resolved, source: 'official-registry' as const };
  return {
    async findCalldata() {
      return tagged;
    },
    async findEip712() {
      return tagged;
    },
  };
}

/** Render one golden the way the committed screen text was produced. */
export async function renderGoldenScreen(
  item: GoldenCaseRef,
  input: InputDescriptor,
  loader: IncludeLoader,
  sdk: GoldenSdk
): Promise<string> {
  const resolved = await sdk.resolveDescriptor(input, loader);
  const deployment = resolved.deployments[0];
  if (!deployment) {
    throw new Error(`${item.id} has no deployment`);
  }
  const options = { registry: registryOf(resolved), provider: null, now: 0 };
  const result =
    item.kind === 'eip712'
      ? await sdk.decodeTypedData(typedSample(item.id, resolved), options)
      : await sdk.decodeTransaction(
          {
            to: deployment.address,
            data: encodeCall(pickFormat(item.id, resolved.merged)),
            chainId: deployment.chainId,
            ...(WITH_VALUE.has(item.id) ? { value: 10n ** 18n } : {}),
          },
          options
        );
  if (result.source !== 'official-registry' || !result.trust.accepted) {
    throw new Error(
      `${item.id} decoded as ${result.source} accepted=${result.trust.accepted} intent=${result.intent} [${result.diagnostics.map((entry) => entry.code).join(', ')}]`
    );
  }
  return `${sdk.renderScreensText(sdk.toScreens(result))}\n`;
}
