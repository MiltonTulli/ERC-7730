import { describe, expect, it, vi } from 'vitest';
import { Registry } from '../registry';
import type { InputDescriptor } from '../types/descriptor';

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

const customDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    contract: {
      deployments: [{ chainId: 1, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' }],
    },
  },
  metadata: { owner: 'Test' },
  display: {
    formats: {
      'poke()': { intent: 'Poke' },
    },
  },
} as InputDescriptor;

describe('Registry builtins', () => {
  it('resolves the ERC-20 transfer signature', () => {
    const match = new Registry().find('transfer(address,uint256)');
    expect(match?.descriptor.context).toMatchObject({ $id: 'ERC20' });
    expect(match?.format.intent).toBe('Send tokens');
  });

  it('resolves WETH by deployment address', () => {
    const descriptor = new Registry().findByAddress(WETH, 1);
    expect(descriptor?.context).toMatchObject({ $id: 'WETH' });
  });

  it('lists the ERC-20, ERC-721, and WETH builtins before extend()', () => {
    const registry = new Registry();
    expect(registry.find('transfer(address,uint256)')).not.toBeNull();
    expect(registry.find('safeTransferFrom(address,address,uint256)')).not.toBeNull();
    expect(registry.find('deposit()')).not.toBeNull();
    expect(registry.find('poke()')).toBeNull();
  });

  it('rejects useExternalRegistry instead of serving the old snapshot', () => {
    expect(() => new Registry({ useExternalRegistry: true } as never)).toThrow(
      /createOfficialRegistry/
    );
    expect(() => new Registry({ useExternalRegistry: false } as never)).toThrow(
      /createOfficialRegistry/
    );
  });

  it('skips an invalid extend() and indexes a valid one', () => {
    const registry = new Registry();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rejected = registry.extend({ metadata: { owner: 'Nope' } } as InputDescriptor);
    error.mockRestore();

    expect(rejected[0]?.ok).toBe(false);
    expect(registry.find('poke()')).toBeNull();

    const accepted = registry.extend(customDescriptor);
    expect(accepted[0]?.ok).toBe(true);
    expect(registry.find('poke()')?.format.intent).toBe('Poke');
  });
});
