import { AbiParameters } from 'ox';
import { type ParsedParam, parseDeclaration } from '../../src/decode/abi';

const ZERO = '0x0000000000000000000000000000000000000000';

function zeroFor(param: ParsedParam): unknown {
  const array = param.type.match(/^(.*)\[(\d*)\]$/);
  if (array?.[1] !== undefined) {
    const length = array[2] === '' ? 0 : Number(array[2]);
    const inner: ParsedParam = { type: array[1], components: param.components };
    return Array.from({ length }, () => zeroFor(inner));
  }
  if (param.components && param.components.length > 0) {
    return param.components.map((component) => zeroFor(component));
  }
  if (param.type.startsWith('uint') || param.type.startsWith('int')) {
    return 0n;
  }
  if (param.type === 'address') {
    return ZERO;
  }
  if (param.type === 'bool') {
    return false;
  }
  if (param.type === 'string') {
    return '';
  }
  if (param.type === 'bytes') {
    return '0x';
  }
  const fixed = param.type.match(/^bytes(\d+)$/);
  if (fixed?.[1]) {
    return `0x${'00'.repeat(Number(fixed[1]))}`;
  }
  throw new Error(`Cannot zero-encode ${param.type}`);
}

/** ABI-encode a Solidity declaration. `values` defaults to zeros. Selector included. */
export function encodeArgs(declaration: string, values?: readonly unknown[]): `0x${string}` {
  const parsed = parseDeclaration(declaration);
  if (!parsed) {
    throw new Error(`Cannot parse ${declaration}`);
  }
  if (parsed.params.length === 0) {
    return parsed.selector as `0x${string}`;
  }
  const params = AbiParameters.from(parsed.params.map((param) => param.type).join(','));
  const encoded = AbiParameters.encode(
    params,
    (values ?? parsed.params.map((param) => zeroFor(param))) as never
  );
  return `${parsed.selector}${encoded.slice(2)}` as `0x${string}`;
}

/** ABI-encode a Solidity declaration with zero values. Selector included. */
export function encodeCall(declaration: string): `0x${string}` {
  return encodeArgs(declaration);
}
