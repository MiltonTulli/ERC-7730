#!/usr/bin/env node

/**
 * Build script for the ERC-7730 SDK
 *
 * This script:
 * 1. Copies the registry JSON from the registry package
 * 2. Generates a TypeScript file that embeds the registry (minified)
 * 3. Runs the TypeScript compiler
 * 4. Removes sourcemaps to reduce package size
 */

import { execSync } from 'node:child_process';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_JSON = join(ROOT, '..', 'registry', 'dist', 'registry.json');
const OUTPUT_DIR = join(ROOT, 'src', 'registry');
const DIST_DIR = join(ROOT, 'dist');

/**
 * Recursively remove all .map files from a directory
 */
async function removeSourcemaps(dir) {
  let count = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        count += await removeSourcemaps(fullPath);
      } else if (entry.name.endsWith('.map')) {
        await rm(fullPath);
        count++;
      }
    }
  } catch (err) {
    // Directory might not exist yet
  }
  return count;
}

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

  // Generate the embedded registry module (minified JSON, no pretty print)
  console.log('\nGenerating embedded registry...');
  const embeddedContent = `/**
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EMBEDDED_REGISTRY: any = ${JSON.stringify(minifiedRegistry)};

export default EMBEDDED_REGISTRY;
`;

  await writeFile(join(OUTPUT_DIR, 'embedded.ts'), embeddedContent);
  console.log('  ✓ Generated src/registry/embedded.ts');

  // Run TypeScript compiler
  console.log('\nCompiling TypeScript...');
  try {
    execSync('npx tsc', { cwd: ROOT, stdio: 'inherit' });
    console.log('  ✓ TypeScript compilation complete');
  } catch (err) {
    console.error('TypeScript compilation failed');
    process.exit(1);
  }

  // Remove sourcemaps to reduce package size
  console.log('\nRemoving sourcemaps...');
  const removedCount = await removeSourcemaps(DIST_DIR);
  console.log(`  ✓ Removed ${removedCount} sourcemap files`);

  console.log('\n✅ Build complete!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
