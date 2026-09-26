/**
 * Bound decode helper. Prefer {@link createClearSigner} or the functional
 * {@link decodeTransaction} / {@link decodeTypedData} APIs.
 */

import { matchContext, resolveImplementation } from '../decode/context.js';
import { decodeTransaction } from '../decode/decodeTransaction.js';
import { decodeTypedData } from '../decode/decodeTypedData.js';
import type { DecodeOptions, DecodeRegistry, DecodedOperation } from '../decode/types.js';
import type { OfficialRegistry } from '../official-registry/types.js';
import { createMemoryIncludeLoader, resolveDescriptor } from '../resolve/index.js';
import { isPlainObject } from '../resolve/util.js';
import { validateDescriptor } from '../schema/index.js';
import type { InputDescriptor, ResolvedDescriptor } from '../types/descriptor.js';
import type { Provider, TransactionInput, TypedDataInput } from '../types/index.js';

type BoundRegistry = DecodeRegistry & {
  extend(descriptors: InputDescriptor[]): void;
};

function hasExtend(registry: DecodeRegistry | OfficialRegistry): registry is BoundRegistry {
  return 'extend' in registry && typeof registry.extend === 'function';
}

function overrideKind(resolved: ResolvedDescriptor): 'calldata' | 'eip712' | null {
  const context = isPlainObject(resolved.merged.context) ? resolved.merged.context : undefined;
  if (!context) {
    return null;
  }
  if (isPlainObject(context.contract)) {
    return 'calldata';
  }
  if (isPlainObject(context.eip712)) {
    return 'eip712';
  }
  return null;
}

function deploymentsHit(resolved: ResolvedDescriptor, chainId: number, address: string): boolean {
  const want = address.toLowerCase();
  return resolved.deployments.some(
    (item) => item.chainId === chainId && item.address.toLowerCase() === want
  );
}

/**
 * Local overlay used when no registry is passed, or the registry has no `extend`.
 * OfficialRegistry already owns overrides; those instances are used as-is.
 */
function createBoundRegistry(base?: DecodeRegistry | OfficialRegistry): BoundRegistry {
  if (base && hasExtend(base)) {
    return base;
  }

  const overrides: InputDescriptor[] = [];
  const resolvedOverrides = new Map<InputDescriptor, Promise<ResolvedDescriptor>>();

  async function resolveOverride(input: InputDescriptor): Promise<ResolvedDescriptor> {
    let pending = resolvedOverrides.get(input);
    if (!pending) {
      pending = resolveDescriptor(input, createMemoryIncludeLoader({})).then((resolved) => ({
        ...resolved,
        source: 'local-override' as const,
      }));
      resolvedOverrides.set(input, pending);
    }
    return pending;
  }

  async function findOverride(
    key: {
      chainId: number;
      address: `0x${string}`;
      typedData?: import('../types/index.js').TypedDataInput;
      provider?: Provider | null;
      fromBlock?: DecodeOptions['fromBlock'];
      toBlock?: DecodeOptions['toBlock'];
    },
    kind: 'calldata' | 'eip712'
  ): Promise<ResolvedDescriptor | null> {
    const address = key.address.toLowerCase() as `0x${string}`;
    const impl = await resolveImplementation(address, key.provider);
    for (const input of overrides) {
      const resolved = await resolveOverride(input);
      if (overrideKind(resolved) !== kind) {
        continue;
      }
      if (deploymentsHit(resolved, key.chainId, address)) {
        return resolved;
      }
      if (impl && impl !== address && deploymentsHit(resolved, key.chainId, impl)) {
        return resolved;
      }
      if (kind === 'eip712') {
        if (!key.typedData) {
          continue;
        }
        const bound = await matchContext(resolved, key.typedData, {
          provider: key.provider,
          fromBlock: key.fromBlock,
          toBlock: key.toBlock,
        });
        if (bound.matched) {
          return resolved;
        }
        continue;
      }
      const bound = await matchContext(
        resolved,
        { to: address, data: '0x', chainId: key.chainId },
        { provider: key.provider, fromBlock: key.fromBlock, toBlock: key.toBlock }
      );
      if (bound.matched) {
        return resolved;
      }
    }
    return null;
  }

  return {
    async findCalldata(key) {
      const local = await findOverride(key, 'calldata');
      if (local) {
        return local;
      }
      return base?.findCalldata(key) ?? null;
    },
    async findEip712(key) {
      const local = await findOverride(key, 'eip712');
      if (local) {
        return local;
      }
      return base?.findEip712?.(key) ?? null;
    },
    extend(descriptors) {
      for (let i = 0; i < descriptors.length; i++) {
        const descriptor = descriptors[i];
        const hasIncludes =
          typeof descriptor.includes === 'string' ? descriptor.includes.length > 0 : false;
        if (hasIncludes) {
          throw new Error(
            `Descriptor at index ${i} uses includes; the local overlay has no include loader. Pass createOfficialRegistry({ pin }) or resolve includes first.`
          );
        }
        const validation = validateDescriptor(descriptor);
        if (!validation.ok) {
          const details = validation.errors
            .map((error) => `${error.path}: ${error.message}`)
            .join('; ');
          throw new Error(`Invalid descriptor at index ${i}: ${details}`);
        }
        overrides.push(descriptor);
      }
    },
  };
}

function isDescriptorList(
  value: InputDescriptor | readonly InputDescriptor[]
): value is readonly InputDescriptor[] {
  return Array.isArray(value);
}

function asDescriptorList(
  descriptors: InputDescriptor | readonly InputDescriptor[]
): InputDescriptor[] {
  return isDescriptorList(descriptors) ? [...descriptors] : [descriptors];
}

/**
 * Bound `DecodeOptions` for repeated decode calls. Prefer
 * {@link createClearSigner} over `new ClearSigner()`.
 */
export class ClearSigner {
  private readonly options: DecodeOptions;
  private readonly registry: BoundRegistry;

  constructor(options: DecodeOptions = {}) {
    this.registry = createBoundRegistry(options.registry);
    this.options = { ...options, registry: this.registry };
  }

  decodeTransaction(tx: TransactionInput): Promise<DecodedOperation> {
    return decodeTransaction(tx, this.options);
  }

  decodeTypedData(data: TypedDataInput): Promise<DecodedOperation> {
    return decodeTypedData(data, this.options);
  }

  /**
   * Add local descriptor overrides on the bound registry.
   *
   * Accepts one document or an array (the v1 `extend` shape).
   */
  extend(descriptors: InputDescriptor | readonly InputDescriptor[]): void {
    this.registry.extend(asDescriptorList(descriptors));
  }

  /**
   * @deprecated Use {@link ClearSigner.decodeTransaction}. Alias for one minor (`0.3.x`).
   */
  decode(tx: TransactionInput): Promise<DecodedOperation> {
    return this.decodeTransaction(tx);
  }
}

/**
 * Bind `DecodeOptions` (registry, trust, provider, …) for repeated calls.
 *
 * Functional `decodeTransaction` / `decodeTypedData` remain the primary surface.
 */
export function createClearSigner(options?: DecodeOptions): ClearSigner {
  return new ClearSigner(options);
}
