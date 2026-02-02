/**
 * ERC-7730 Registry Types
 */

export interface ERC7730Deployment {
  chainId: number;
  address: string;
}

export interface ERC7730Context {
  $id?: string;
  contract?: {
    deployments?: ERC7730Deployment[];
    abi?: string;
  };
  eip712?: {
    domain?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
}

export interface ERC7730Metadata {
  owner?: string;
  info?: {
    legalName?: string;
    url?: string;
    deploymentDate?: string;
  };
  constants?: Record<string, string>;
  enums?: Record<string, Record<string, string>>;
}

export interface ERC7730FieldDefinition {
  path: string;
  label: string;
  format: string;
  params?: Record<string, unknown>;
}

export interface ERC7730FunctionFormat {
  $id?: string;
  intent: string;
  fields: ERC7730FieldDefinition[];
  required?: string[];
}

export interface ERC7730Display {
  formats: Record<string, ERC7730FunctionFormat>;
  definitions?: Record<string, unknown>;
}

export interface ERC7730Descriptor {
  $schema?: string;
  context: ERC7730Context;
  metadata?: ERC7730Metadata;
  display: ERC7730Display;
  includes?: string;
}

export interface RegistryDescriptorEntry {
  protocol: string;
  file: string;
  context: ERC7730Context;
  metadata?: ERC7730Metadata;
  display: ERC7730Display;
}

export interface ERC7730Registry {
  $schema: string;
  version: string;
  generated: string;
  stats: {
    protocols: number;
    descriptors: number;
    selectors: number;
    addresses: number;
  };
  bySelector: Record<string, string[]>;
  byAddress: Record<string, string[]>;
  descriptors: Record<string, RegistryDescriptorEntry>;
}
