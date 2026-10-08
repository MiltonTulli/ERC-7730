import {
  VENDORED_REGISTRY_COMMIT,
  createOfficialRegistry,
  decodeTransaction,
  officialOnlyPolicy,
} from '@erc7730/sdk';

const registry = createOfficialRegistry({ pin: VENDORED_REGISTRY_COMMIT });

const result = await decodeTransaction(
  {
    to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    data: '0xd0e30db0',
    value: 10n ** 18n,
    chainId: 1,
  },
  { registry, trust: officialOnlyPolicy() }
);

console.log(result.interpolatedIntent ?? result.intent);
console.log(result.fields);
console.log(result.source, result.confidence, result.trust.accepted);
