import { createClearSigner } from '@erc7730/sdk';

// @ts-expect-error ClearSigner is constructed through createClearSigner.
import { ClearSigner } from '@erc7730/sdk';
// @ts-expect-error Use decodeTransaction.
import { format } from '@erc7730/sdk';
// @ts-expect-error Supply an IncludeLoader implementation.
import { createMemoryIncludeLoader } from '@erc7730/sdk';
// @ts-expect-error The compatibility entry was removed in 1.0.
import type * as legacy from '@erc7730/sdk/legacy';

const signer = createClearSigner();
signer.decodeTransaction;
signer.decodeTypedData;
signer.clearSign;
signer.extend;
// @ts-expect-error Use signer.decodeTransaction.
signer.decode;
