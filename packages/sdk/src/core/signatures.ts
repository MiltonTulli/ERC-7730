/**
 * Common function signatures database
 * This allows decoding without network calls for common functions
 */

import { keccak256, toBytes } from 'viem';

export interface FunctionSignature {
  selector: string;
  signature: string;
  name: string;
}

// Runtime-registered signatures (from custom descriptors/ABIs)
const customSignatures: Map<string, FunctionSignature> = new Map();

/**
 * Built-in function signatures for common operations
 * Selector = first 4 bytes of keccak256(signature)
 */
export const COMMON_SIGNATURES: Record<string, FunctionSignature> = {
  // ERC20
  '0xa9059cbb': {
    selector: '0xa9059cbb',
    signature: 'transfer(address,uint256)',
    name: 'transfer',
  },
  '0x095ea7b3': {
    selector: '0x095ea7b3',
    signature: 'approve(address,uint256)',
    name: 'approve',
  },
  '0x23b872dd': {
    selector: '0x23b872dd',
    signature: 'transferFrom(address,address,uint256)',
    name: 'transferFrom',
  },
  '0x70a08231': {
    selector: '0x70a08231',
    signature: 'balanceOf(address)',
    name: 'balanceOf',
  },
  '0xdd62ed3e': {
    selector: '0xdd62ed3e',
    signature: 'allowance(address,address)',
    name: 'allowance',
  },
  '0x18160ddd': {
    selector: '0x18160ddd',
    signature: 'totalSupply()',
    name: 'totalSupply',
  },

  // ERC721
  '0x42842e0e': {
    selector: '0x42842e0e',
    signature: 'safeTransferFrom(address,address,uint256)',
    name: 'safeTransferFrom',
  },
  '0xb88d4fde': {
    selector: '0xb88d4fde',
    signature: 'safeTransferFrom(address,address,uint256,bytes)',
    name: 'safeTransferFrom',
  },
  '0xa22cb465': {
    selector: '0xa22cb465',
    signature: 'setApprovalForAll(address,bool)',
    name: 'setApprovalForAll',
  },
  '0x081812fc': {
    selector: '0x081812fc',
    signature: 'getApproved(uint256)',
    name: 'getApproved',
  },
  '0x6352211e': {
    selector: '0x6352211e',
    signature: 'ownerOf(uint256)',
    name: 'ownerOf',
  },

  // ERC1155
  '0xf242432a': {
    selector: '0xf242432a',
    signature: 'safeTransferFrom(address,address,uint256,uint256,bytes)',
    name: 'safeTransferFrom',
  },
  '0x2eb2c2d6': {
    selector: '0x2eb2c2d6',
    signature: 'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',
    name: 'safeBatchTransferFrom',
  },

  // Common DeFi
  '0x3593564c': {
    selector: '0x3593564c',
    signature: 'execute(bytes,bytes[],uint256)',
    name: 'execute',
  },
  '0x414bf389': {
    selector: '0x414bf389',
    signature: 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
    name: 'exactInputSingle',
  },
  '0xc04b8d59': {
    selector: '0xc04b8d59',
    signature: 'exactInput((bytes,address,uint256,uint256,uint256))',
    name: 'exactInput',
  },
  '0xdb3e2198': {
    selector: '0xdb3e2198',
    signature:
      'exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
    name: 'exactOutputSingle',
  },
  '0x5ae401dc': {
    selector: '0x5ae401dc',
    signature: 'multicall(uint256,bytes[])',
    name: 'multicall',
  },
  '0xac9650d8': {
    selector: '0xac9650d8',
    signature: 'multicall(bytes[])',
    name: 'multicall',
  },

  // WETH
  '0xd0e30db0': {
    selector: '0xd0e30db0',
    signature: 'deposit()',
    name: 'deposit',
  },
  '0x2e1a7d4d': {
    selector: '0x2e1a7d4d',
    signature: 'withdraw(uint256)',
    name: 'withdraw',
  },

  // Permit
  '0xd505accf': {
    selector: '0xd505accf',
    signature: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
    name: 'permit',
  },

  // Proxy patterns
  '0x5c60da1b': {
    selector: '0x5c60da1b',
    signature: 'implementation()',
    name: 'implementation',
  },
  '0x3659cfe6': {
    selector: '0x3659cfe6',
    signature: 'upgradeTo(address)',
    name: 'upgradeTo',
  },

  // Gnosis Safe
  '0x6a761202': {
    selector: '0x6a761202',
    signature:
      'execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
    name: 'execTransaction',
  },
};

/**
 * Get function signature by selector
 */
export function getSignatureBySelector(selector: string): FunctionSignature | null {
  const normalized = selector.toLowerCase();
  // Check custom signatures first (allows overrides)
  return customSignatures.get(normalized) || COMMON_SIGNATURES[normalized] || null;
}

/**
 * Compute selector from function signature
 */
export function computeSelector(signature: string): string {
  const hash = keccak256(toBytes(signature));
  return hash.slice(0, 10).toLowerCase();
}

/**
 * Register a custom function signature
 */
export function registerSignature(signature: string): FunctionSignature {
  const selector = computeSelector(signature);
  const match = signature.match(/^(\w+)\(/);
  const name = match ? match[1] : 'unknown';

  const sig: FunctionSignature = {
    selector,
    signature,
    name,
  };

  customSignatures.set(selector, sig);
  return sig;
}

/**
 * Register multiple signatures from an ABI-like list
 */
export function registerSignatures(signatures: string[]): void {
  for (const sig of signatures) {
    registerSignature(sig);
  }
}

/**
 * Clear all custom signatures (useful for testing)
 */
export function clearCustomSignatures(): void {
  customSignatures.clear();
}

/**
 * Parse function signature into parameter types
 */
export function parseSignature(signature: string): {
  name: string;
  inputs: string[];
} {
  const match = signature.match(/^(\w+)\((.*)?\)$/);
  if (!match) {
    throw new Error(`Invalid function signature: ${signature}`);
  }

  const name = match[1];
  const paramsStr = match[2] || '';

  // Handle nested tuples
  const inputs: string[] = [];
  if (paramsStr) {
    let depth = 0;
    let current = '';

    for (const char of paramsStr) {
      if (char === '(') depth++;
      else if (char === ')') depth--;

      if (char === ',' && depth === 0) {
        inputs.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      inputs.push(current.trim());
    }
  }

  return { name, inputs };
}
