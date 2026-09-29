#!/usr/bin/env node

/**
 * Writes the minified embedded registry that tsdown bundles into dist/index.js.
 * Emit itself is tsdown, not tsc. See packages/sdk/tsdown.config.ts.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_JSON = join(ROOT, '..', 'registry', 'dist', 'registry.json');
const OUTPUT_DIR = join(ROOT, 'src', 'registry');

/**
 * Minify a single descriptor - keep only essential display/context data
 */
function minifyDescriptor(descriptor) {
  if (!descriptor) return null;

  const minified = {};

  // Keep display info (essential for rendering)
  if (descriptor.display) {
    minified.display = descriptor.display;
  }

  // Keep minimal context (deployments only, no ABI)
  if (descriptor.context?.contract?.deployments) {
    minified.context = {
      contract: {
        deployments: descriptor.context.contract.deployments,
      },
    };
  }

  // Keep minimal metadata
  if (descriptor.metadata) {
    minified.metadata = {
      owner: descriptor.metadata.owner,
    };
    if (descriptor.metadata.info?.url) {
      minified.metadata.info = { url: descriptor.metadata.info.url };
    }
  }

  return minified;
}

/**
 * Minify registry by removing unnecessary data
 * - Remove ABIs (they can be fetched from Sourcify if needed)
 * - Remove test files
 * - Keep only essential display/context data
 */
function minifyRegistry(registry) {
  const minified = {
    stats: registry.stats,
    bySelector: registry.bySelector, // Keep references as-is
    byAddress: registry.byAddress, // Keep references as-is
    descriptors: {}, // Minify descriptors
  };

  // Minify each descriptor
  for (const [key, descriptor] of Object.entries(registry.descriptors || {})) {
    const minifiedDesc = minifyDescriptor(descriptor);
    if (minifiedDesc) {
      minified.descriptors[key] = minifiedDesc;
    }
  }

  return minified;
}

async function build() {
  console.log('Building ERC-7730 SDK...\n');

  // Read the registry JSON
  console.log('Loading registry...');
  const registryContent = await readFile(REGISTRY_JSON, 'utf-8');
  const registry = JSON.parse(registryContent);
  console.log(
    `  ✓ Loaded ${registry.stats.descriptors} descriptors from ${registry.stats.protocols} protocols`
  );

  // Minify the registry
  console.log('\nMinifying registry (removing ABIs)...');
  const minifiedRegistry = minifyRegistry(registry);
  const originalSize = JSON.stringify(registry).length;
  const minifiedSize = JSON.stringify(minifiedRegistry).length;
  const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
  console.log(
    `  ✓ Reduced from ${(originalSize / 1024).toFixed(0)}KB to ${(minifiedSize / 1024).toFixed(0)}KB (${reduction}% smaller)`
  );

  // Generate the embedded registry module (minified JSON, no pretty print).
  // Concatenate the JSON so a `${` inside a descriptor cannot expand in this template.
  console.log('\nGenerating embedded registry...');
  const embeddedHeader = `/**
 * Embedded ERC-7730 Registry (Minified)
 *
 * Auto-generated from @erc7730/registry - DO NOT EDIT
 * Generated: ${new Date().toISOString()}
 *
 * Stats:
 * - Protocols: ${registry.stats.protocols}
 * - Descriptors: ${registry.stats.descriptors}
 * - Selectors: ${registry.stats.selectors}
 * - Addresses: ${registry.stats.addresses}
 *
 * Note: ABIs are removed to reduce size. Use Sourcify fallback for full ABI.
 */

import type { EmbeddedRegistry } from './embeddedTypes';

export const EMBEDDED_REGISTRY: EmbeddedRegistry = `;
  const embeddedContent = `${embeddedHeader}${JSON.stringify(minifiedRegistry)};

export default EMBEDDED_REGISTRY;
`;

  await writeFile(join(OUTPUT_DIR, 'embedded.ts'), embeddedContent);
  console.log('  ✓ Generated src/registry/embedded.ts');
  console.log('\n✅ Embedded registry ready');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
