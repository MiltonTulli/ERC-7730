import { type TransactionInput, clearSign } from '@erc7730/sdk';

const tx = {
  to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  data: '0xd0e30db0',
  value: 10n ** 18n,
  chainId: 1,
} satisfies TransactionInput;

const signed = await clearSign(tx);

console.log(signed.screens.headline);
console.log(signed.screens.verification);
console.log(signed.source, signed.confidence, signed.trust.accepted);
