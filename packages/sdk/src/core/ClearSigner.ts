/**
 * ClearSigner - Main class for decoding transactions
 */

import { createPublicClient, http } from 'viem';
import type {
  ClearSignerConfig,
  ChainName,
  Provider,
  TransactionInput,
} from '../types/index.js';
import type {
  DecodedTransaction,
  DecodedField,
  SecurityWarning,
  FunctionFormat,
  FieldDefinition,
  ERC7730Descriptor,
} from '../types/erc7730.js';
import { decodeCalldata, type RawDecodedTransaction } from './decoder.js';
import { Registry, type RegistryMatch } from '../registry/index.js';
import {
  getTokenInfo,
  formatAmount,
  isInfiniteApproval,
} from '../formats/tokenAmount.js';
import { resolveAddress, formatAddress } from '../formats/addressName.js';
import { getChain, getDefaultRpc, chainNameToId } from '../providers/rpc.js';
import { fetchFromSourcify } from '../providers/sourcify.js';
import { generateDescriptor } from '../generate/generate.js';

export class ClearSigner {
  private provider: Provider | null;
  private registry: Registry;
  private useDefaultProvider: boolean;
  private rpcUrl: string | undefined;
  private useSourcifyFallback: boolean;

  // Cache for Sourcify lookups to avoid repeated requests
  private sourcifyCache: Map<string, ERC7730Descriptor | null> = new Map();

  /**
   * Create a ClearSigner instance for a specific chain
   * @example
   * const signer = ClearSigner.forChain('ethereum');
   * const signer = ClearSigner.forChain('arbitrum');
   */
  static forChain(chain: ChainName): ClearSigner {
    const chainId = chainNameToId(chain);
    return new ClearSigner({ chainId });
  }

  constructor(config: ClearSignerConfig = {}) {
    // Store custom RPC URL if provided
    this.rpcUrl = config.rpcUrl;

    // If provider is explicitly null, don't use any provider
    // If provider is undefined, we'll create one on-demand using public RPCs
    if (config.provider === null) {
      this.provider = null;
      this.useDefaultProvider = false;
    } else if (config.provider) {
      this.provider = config.provider;
      this.useDefaultProvider = false;
    } else {
      this.provider = null;
      this.useDefaultProvider = true; // Will create provider on-demand
    }

    // Enable Sourcify fallback by default (can be disabled via config)
    this.useSourcifyFallback = config.useSourcifyFallback ?? true;

    this.registry = new Registry();

    // Add custom descriptors if provided
    if (config.registry?.custom) {
      this.registry.extend(config.registry.custom);
    }
  }

  /**
   * Get or create a provider for the given chain
   */
  private getProviderForChain(chainId: number): Provider | null {
    if (this.provider) {
      return this.provider;
    }

    if (!this.useDefaultProvider) {
      return null;
    }

    // Create a provider using custom RPC URL or public RPCs
    const chain = getChain(chainId);
    const rpcUrl = this.rpcUrl || getDefaultRpc(chainId);

    if (!chain || !rpcUrl) {
      return null;
    }

    try {
      return createPublicClient({
        chain,
        transport: http(rpcUrl),
      });
    } catch {
      return null;
    }
  }

  /**
   * Decode a transaction into human-readable format
   */
  async decode(tx: TransactionInput): Promise<DecodedTransaction> {
    // Get provider for this chain
    const provider = this.getProviderForChain(tx.chainId);

    // Step 1: Decode raw calldata
    const raw = decodeCalldata(tx);

    // Step 2: Find matching descriptor in registry
    const match = raw.signature ? this.registry.find(raw.signature) : null;

    // Step 3: Build decoded result from registry
    if (match) {
      return this.buildFromDescriptor(tx, raw, match.format, provider, 'registry');
    }

    // Step 4: Try Sourcify fallback if enabled and we have a valid contract
    if (this.useSourcifyFallback && tx.to && tx.to !== '0x0000000000000000000000000000000000000000') {
      const sourcifyResult = await this.trySourceify(tx);
      if (sourcifyResult) {
        // Use the updated raw (with signature resolved from ABI)
        return this.buildFromDescriptor(tx, sourcifyResult.updatedRaw, sourcifyResult.match.format, provider, 'sourcify');
      }
    }

    // Step 5: Fallback to inferred decoding
    return this.buildInferred(tx, raw, provider);
  }

  /**
   * Try to fetch ABI from Sourcify and generate a descriptor
   */
  private async trySourceify(
    tx: TransactionInput
  ): Promise<{ match: RegistryMatch; updatedRaw: RawDecodedTransaction } | null> {
    const cacheKey = `${tx.chainId}:${tx.to.toLowerCase()}`;

    // Check cache first
    if (this.sourcifyCache.has(cacheKey)) {
      const cached = this.sourcifyCache.get(cacheKey);
      if (cached) {
        // Re-decode with new signatures registered
        const updatedRaw = decodeCalldata(tx);
        const match = this.findMatchInDescriptor(cached, updatedRaw);
        if (match) {
          return { match, updatedRaw };
        }
      }
      return null;
    }

    try {
      const result = await fetchFromSourcify(tx.chainId, tx.to);

      if (!result.verified || !result.abi) {
        // Cache negative result
        this.sourcifyCache.set(cacheKey, null);
        return null;
      }

      // Generate descriptor from ABI
      const descriptor = generateDescriptor({
        chainId: tx.chainId,
        address: tx.to,
        abi: result.abi,
        owner: result.name || undefined,
      });

      // Register the descriptor for future lookups
      // This also registers the function signatures!
      this.registry.extend([descriptor]);

      // Cache positive result
      this.sourcifyCache.set(cacheKey, descriptor);

      // Re-decode with the new signatures registered
      const updatedRaw = decodeCalldata(tx);

      // Find matching format
      const match = this.findMatchInDescriptor(descriptor, updatedRaw);
      if (match) {
        return { match, updatedRaw };
      }

      return null;
    } catch (error) {
      console.warn('[ERC7730 SDK] Sourcify fallback failed:', (error as Error).message);
      this.sourcifyCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Find matching format in a descriptor for the given raw transaction
   */
  private findMatchInDescriptor(
    descriptor: ERC7730Descriptor,
    raw: RawDecodedTransaction
  ): RegistryMatch | null {
    if (!raw.signature) return null;

    const format = descriptor.display.formats[raw.signature];
    if (format) {
      return { descriptor, format };
    }

    return null;
  }

  /**
   * Build decoded result using ERC-7730 descriptor
   */
  private async buildFromDescriptor(
    tx: TransactionInput,
    raw: RawDecodedTransaction,
    format: FunctionFormat,
    provider: Provider | null,
    source: 'registry' | 'sourcify' = 'registry'
  ): Promise<DecodedTransaction> {
    const fields: DecodedField[] = [];
    const warnings: SecurityWarning[] = [];

    // Map argument names from signature to values
    const argMap = this.buildArgMap(raw);

    // Process each field in the format
    for (const fieldDef of format.fields) {
      const field = await this.processField(fieldDef, argMap, tx, provider);
      fields.push(field);

      // Check for security warnings
      const fieldWarnings = this.checkFieldWarnings(fieldDef, field, raw);
      warnings.push(...fieldWarnings);
    }

    return {
      confidence: 'high',
      source,
      intent: format.intent || this.inferIntent(raw.functionName),
      functionName: raw.functionName || 'unknown',
      signature: raw.signature || raw.selector,
      fields,
      warnings,
      metadata: {
        chainId: tx.chainId,
        contractAddress: tx.to,
      },
      raw: {
        selector: raw.selector,
        args: raw.args as readonly unknown[],
      },
    };
  }

  /**
   * Build arg map from decoded calldata
   * Maps both index-based paths ([0], [1]) and common parameter names
   */
  private buildArgMap(raw: ReturnType<typeof decodeCalldata>): Map<string, unknown> {
    const map = new Map<string, unknown>();

    // Always set by index
    raw.args.forEach((arg, index) => {
      map.set(`[${index}]`, arg);
    });

    if (!raw.signature) return map;

    // Use common parameter names based on function signature
    const paramNames = this.getParamNames(raw.signature);
    paramNames.forEach((name, index) => {
      if (raw.args[index] !== undefined && name) {
        map.set(name, raw.args[index]);
      }
    });

    return map;
  }

  /**
   * Get common parameter names for known function signatures
   * This provides semantic mapping without requiring named params in signatures
   */
  private getParamNames(signature: string): string[] {
    // Common mappings for well-known functions
    const knownParams: Record<string, string[]> = {
      // ERC20
      'transfer(address,uint256)': ['to', 'amount'],
      'approve(address,uint256)': ['spender', 'amount'],
      'transferFrom(address,address,uint256)': ['from', 'to', 'amount'],
      'increaseAllowance(address,uint256)': ['spender', 'addedValue'],
      'decreaseAllowance(address,uint256)': ['spender', 'subtractedValue'],

      // ERC721
      'safeTransferFrom(address,address,uint256)': ['from', 'to', 'tokenId'],
      'safeTransferFrom(address,address,uint256,bytes)': ['from', 'to', 'tokenId', 'data'],
      'setApprovalForAll(address,bool)': ['operator', 'approved'],

      // WETH
      'withdraw(uint256)': ['amount'],
      'deposit()': [],
    };

    return knownParams[signature] || [];
  }

  /**
   * Process a single field according to its format
   */
  private async processField(
    fieldDef: FieldDefinition,
    argMap: Map<string, unknown>,
    tx: TransactionInput,
    provider: Provider | null
  ): Promise<DecodedField> {
    // Get raw value from path
    const rawValue = this.resolveFieldPath(fieldDef.path, argMap, tx);
    let formattedValue: string;

    switch (fieldDef.format) {
      case 'tokenAmount':
        formattedValue = await this.formatTokenAmount(rawValue, tx, provider);
        break;

      case 'addressName':
        formattedValue = await this.formatAddressName(rawValue, tx.chainId, provider);
        break;

      case 'date':
        formattedValue = this.formatDate(rawValue);
        break;

      case 'raw':
      default:
        formattedValue = this.formatRaw(rawValue);
        break;
    }

    return {
      label: fieldDef.label,
      value: formattedValue,
      rawValue,
      path: fieldDef.path,
      format: fieldDef.format,
    };
  }

  /**
   * Resolve field path to value
   */
  private resolveFieldPath(
    path: string,
    argMap: Map<string, unknown>,
    tx: TransactionInput
  ): unknown {
    // Handle special paths
    if (path === '@.to') return tx.to;
    if (path === '@.from') return tx.from;
    if (path === '@.value') return tx.value;

    // Handle argument names
    return argMap.get(path) ?? argMap.get(`[${path}]`) ?? null;
  }

  /**
   * Format token amount with decimals and symbol
   */
  private async formatTokenAmount(
    value: unknown,
    tx: TransactionInput,
    provider: Provider | null
  ): Promise<string> {
    if (value === null || value === undefined) return 'Unknown';

    const amount = BigInt(value as string | number | bigint);

    // Try to get token info from contract address (skip if zero address)
    const isValidContract = tx.to && tx.to !== '0x0000000000000000000000000000000000000000';
    if (isValidContract) {
      const tokenInfo = await getTokenInfo(tx.to, tx.chainId, provider);
      if (tokenInfo) {
        return formatAmount(amount, tokenInfo.decimals, tokenInfo.symbol);
      }
    }

    // Without token info, show raw value with unit notation
    // We can't assume decimals without knowing the token contract
    return `${amount.toString()} (raw units)`;
  }

  /**
   * Format address with ENS resolution
   */
  private async formatAddressName(
    value: unknown,
    chainId: number,
    provider: Provider | null
  ): Promise<string> {
    if (!value || typeof value !== 'string') return 'Unknown';

    const resolved = await resolveAddress(value, chainId, provider);
    return formatAddress(resolved.address, resolved.name);
  }

  /**
   * Format date from timestamp
   */
  private formatDate(value: unknown): string {
    if (value === null || value === undefined) return 'Unknown';

    const timestamp = Number(value);
    const date = new Date(timestamp * 1000);

    return date.toLocaleString();
  }

  /**
   * Format raw value
   */
  private formatRaw(value: unknown): string {
    if (value === null || value === undefined) return 'Unknown';

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    return String(value);
  }

  /**
   * Check for security warnings on a field
   */
  private checkFieldWarnings(
    fieldDef: FieldDefinition,
    field: DecodedField,
    raw: ReturnType<typeof decodeCalldata>
  ): SecurityWarning[] {
    const warnings: SecurityWarning[] = [];

    // Check for infinite approval
    if (
      fieldDef.format === 'tokenAmount' &&
      raw.functionName === 'approve' &&
      field.rawValue !== null
    ) {
      if (isInfiniteApproval(field.rawValue as bigint)) {
        warnings.push({
          type: 'infinite_approval',
          severity: 'high',
          message: 'This approval grants unlimited spending access to your tokens',
        });
      }
    }

    return warnings;
  }

  /**
   * Build inferred result when no descriptor matches
   */
  private async buildInferred(
    tx: TransactionInput,
    raw: ReturnType<typeof decodeCalldata>,
    provider: Provider | null
  ): Promise<DecodedTransaction> {
    const fields: DecodedField[] = [];

    // Build fields from raw args
    for (let i = 0; i < raw.args.length; i++) {
      const type = raw.inputTypes[i] || 'unknown';
      const value = raw.args[i];

      let formattedValue: string;
      let format: DecodedField['format'] = 'raw';

      // Infer formatting from type
      if (type === 'address') {
        formattedValue = await this.formatAddressName(value, tx.chainId, provider);
        format = 'addressName';
      } else if (type.startsWith('uint') && this.looksLikeAmount(value as bigint)) {
        formattedValue = await this.formatTokenAmount(value, tx, provider);
        format = 'tokenAmount';
      } else {
        formattedValue = this.formatRaw(value);
      }

      fields.push({
        label: `Param ${i + 1}`,
        value: formattedValue,
        rawValue: value,
        path: `[${i}]`,
        format,
      });
    }

    return {
      confidence: raw.signature ? 'medium' : 'low',
      source: raw.signature ? 'inferred' : 'basic',
      intent: this.inferIntent(raw.functionName),
      functionName: raw.functionName || 'unknown',
      signature: raw.signature || raw.selector,
      fields,
      warnings: [],
      metadata: {
        chainId: tx.chainId,
        contractAddress: tx.to,
      },
      raw: {
        selector: raw.selector,
        args: raw.args as readonly unknown[],
      },
    };
  }

  /**
   * Infer intent from function name
   */
  private inferIntent(functionName: string | null): string {
    if (!functionName) return 'Contract interaction';

    // Common patterns
    const patterns: Record<string, string> = {
      transfer: 'Send tokens',
      approve: 'Approve spending',
      swap: 'Swap tokens',
      deposit: 'Deposit',
      withdraw: 'Withdraw',
      stake: 'Stake',
      unstake: 'Unstake',
      claim: 'Claim rewards',
      mint: 'Mint',
      burn: 'Burn',
      execute: 'Execute',
      multicall: 'Multiple calls',
    };

    const lower = functionName.toLowerCase();
    for (const [pattern, intent] of Object.entries(patterns)) {
      if (lower.includes(pattern)) return intent;
    }

    // Capitalize function name
    return functionName.charAt(0).toUpperCase() + functionName.slice(1);
  }

  /**
   * Check if a bigint looks like a token amount (not a small number or address)
   */
  private looksLikeAmount(value: bigint): boolean {
    // Very small numbers are likely IDs or flags
    if (value < 1000n) return false;

    // Very large numbers that look like addresses are not amounts
    if (value > 2n ** 160n) return false;

    return true;
  }

  /**
   * Extend registry with custom descriptors
   */
  extend(descriptors: Parameters<Registry['extend']>[0]): void {
    this.registry.extend(descriptors);
  }
}
