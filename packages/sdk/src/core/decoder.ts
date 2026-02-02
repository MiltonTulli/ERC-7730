/**
 * Core calldata decoder
 */

import { getSignatureBySelector, parseSignature } from './signatures.js';
import type { TransactionInput } from '../types/index.js';

export interface RawDecodedTransaction {
  selector: string;
  signature: string | null;
  functionName: string | null;
  args: unknown[];
  inputTypes: string[];
}

/**
 * Extract function selector from calldata
 */
export function extractSelector(data: string): string {
  if (!data || data.length < 10) {
    throw new Error('Invalid calldata: too short');
  }
  return data.slice(0, 10).toLowerCase();
}

/**
 * Decode ABI-encoded parameters
 * This is a simplified decoder for common types
 */
function decodeParameters(types: string[], data: string): unknown[] {
  const bytes = data.startsWith('0x') ? data.slice(2) : data;
  const results: unknown[] = [];
  let offset = 0;

  for (const type of types) {
    const decoded = decodeParameter(type, bytes, offset);
    results.push(decoded.value);
    offset = decoded.nextOffset;
  }

  return results;
}

interface DecodeResult {
  value: unknown;
  nextOffset: number;
}

function decodeParameter(type: string, data: string, offset: number): DecodeResult {
  // Handle arrays
  if (type.endsWith('[]')) {
    return decodeDynamicArray(type.slice(0, -2), data, offset);
  }

  // Handle fixed arrays
  const fixedArrayMatch = type.match(/^(.+)\[(\d+)\]$/);
  if (fixedArrayMatch) {
    return decodeFixedArray(fixedArrayMatch[1], parseInt(fixedArrayMatch[2]), data, offset);
  }

  // Handle tuples
  if (type.startsWith('(') && type.endsWith(')')) {
    return decodeTuple(type, data, offset);
  }

  // Static types (32 bytes each)
  const word = data.slice(offset * 2, (offset + 32) * 2);

  if (type === 'address') {
    return {
      value: '0x' + word.slice(24),
      nextOffset: offset + 32,
    };
  }

  if (type.startsWith('uint') || type.startsWith('int')) {
    return {
      value: BigInt('0x' + word),
      nextOffset: offset + 32,
    };
  }

  if (type === 'bool') {
    return {
      value: BigInt('0x' + word) !== 0n,
      nextOffset: offset + 32,
    };
  }

  if (type.startsWith('bytes') && type !== 'bytes') {
    // Fixed bytes (bytes1 to bytes32)
    const size = parseInt(type.slice(5));
    return {
      value: '0x' + word.slice(0, size * 2),
      nextOffset: offset + 32,
    };
  }

  if (type === 'bytes' || type === 'string') {
    // Dynamic types - read offset, then data
    const dataOffset = Number(BigInt('0x' + word));
    const lengthWord = data.slice(dataOffset * 2, (dataOffset + 32) * 2);
    const length = Number(BigInt('0x' + lengthWord));
    const content = data.slice((dataOffset + 32) * 2, (dataOffset + 32 + length) * 2);

    if (type === 'string') {
      return {
        value: hexToString('0x' + content),
        nextOffset: offset + 32,
      };
    }

    return {
      value: '0x' + content,
      nextOffset: offset + 32,
    };
  }

  // Unknown type - return raw
  return {
    value: '0x' + word,
    nextOffset: offset + 32,
  };
}

function decodeDynamicArray(itemType: string, data: string, offset: number): DecodeResult {
  const word = data.slice(offset * 2, (offset + 32) * 2);
  const dataOffset = Number(BigInt('0x' + word));

  const lengthWord = data.slice(dataOffset * 2, (dataOffset + 32) * 2);
  const length = Number(BigInt('0x' + lengthWord));

  const items: unknown[] = [];
  let itemOffset = dataOffset + 32;

  for (let i = 0; i < length; i++) {
    const decoded = decodeParameter(itemType, data, itemOffset);
    items.push(decoded.value);
    itemOffset = decoded.nextOffset;
  }

  return {
    value: items,
    nextOffset: offset + 32,
  };
}

function decodeFixedArray(itemType: string, length: number, data: string, offset: number): DecodeResult {
  const items: unknown[] = [];
  let currentOffset = offset;

  for (let i = 0; i < length; i++) {
    const decoded = decodeParameter(itemType, data, currentOffset);
    items.push(decoded.value);
    currentOffset = decoded.nextOffset;
  }

  return {
    value: items,
    nextOffset: currentOffset,
  };
}

function decodeTuple(type: string, data: string, offset: number): DecodeResult {
  // Parse tuple types: (address,uint256,bool) -> ['address', 'uint256', 'bool']
  const inner = type.slice(1, -1);
  const types: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of inner) {
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (char === ',' && depth === 0) {
      types.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) types.push(current.trim());

  const values: unknown[] = [];
  let currentOffset = offset;

  for (const itemType of types) {
    const decoded = decodeParameter(itemType, data, currentOffset);
    values.push(decoded.value);
    currentOffset = decoded.nextOffset;
  }

  return {
    value: values,
    nextOffset: currentOffset,
  };
}

function hexToString(hex: string): string {
  const bytes = hex.startsWith('0x') ? hex.slice(2) : hex;
  let str = '';
  for (let i = 0; i < bytes.length; i += 2) {
    const code = parseInt(bytes.slice(i, i + 2), 16);
    if (code === 0) break;
    str += String.fromCharCode(code);
  }
  return str;
}

/**
 * Decode raw transaction calldata
 */
export function decodeCalldata(tx: TransactionInput): RawDecodedTransaction {
  const { data } = tx;

  if (!data || data === '0x') {
    return {
      selector: '0x',
      signature: null,
      functionName: null,
      args: [],
      inputTypes: [],
    };
  }

  const selector = extractSelector(data);
  const sig = getSignatureBySelector(selector);

  if (!sig) {
    // Unknown function - return raw
    return {
      selector,
      signature: null,
      functionName: null,
      args: [data.slice(10)], // Raw params
      inputTypes: ['bytes'],
    };
  }

  const { name, inputs } = parseSignature(sig.signature);
  const paramsData = data.slice(10);

  let args: unknown[] = [];
  try {
    args = decodeParameters(inputs, paramsData);
  } catch (e) {
    // Fallback to raw if decoding fails
    args = [paramsData];
  }

  return {
    selector,
    signature: sig.signature,
    functionName: name,
    args,
    inputTypes: inputs,
  };
}
