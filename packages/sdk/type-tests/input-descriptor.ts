/**
 * Consumer-facing type check for the schema input model.
 * Run via `pnpm --filter @erc7730/sdk typecheck:consumer` after `pnpm --filter @erc7730/sdk build`.
 */

import type {
  ERC7730Descriptor,
  ERC7730V2Descriptor,
  InputDescriptor,
  ValidationResult,
} from '@erc7730/sdk';
import { validateDescriptor } from '@erc7730/sdk';

const sample: InputDescriptor = {
  $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
  context: {
    $id: 'Example',
    contract: {
      deployments: [{ chainId: 1, address: '0x0000000000000000000000000000000000000001' }],
    },
  },
  metadata: {
    owner: 'Example',
    info: { url: 'https://example.com' },
  },
  display: {
    formats: {
      'transfer(address,uint256)': {
        intent: 'Send tokens',
        fields: [
          {
            path: 'to',
            label: 'Recipient',
            format: 'addressName',
          },
        ],
      },
    },
  },
};

const result: ValidationResult = validateDescriptor(sample);
if (result.ok) {
  const _ok: InputDescriptor = result.descriptor;
  void _ok;
}

// Deprecated aliases stay assignable for one minor.
const _v2: ERC7730V2Descriptor = sample;
const _legacy: ERC7730Descriptor = sample;
void _v2;
void _legacy;
