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

import { readFile, writeFile, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { glob } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_JSON = join(ROOT, '..', 'registry', 'dist', 'registry.json');
const OUTPUT_DIR = join(ROOT, 'src', 'registry');
const DIST_DIR = join(ROOT, 'dist');

/**
 * Minify registry by removing unnecessary data
 * - Remove ABIs (they can be fetched from Sourcify if needed)
 * - Remove test files
 * - Keep only essential display/context data
 */
function minifyRegistry(registry) {
  const minified = {
    stats: registry.stats,
    bySelector: {},
    byAddress: {},
  };

  // Process bySelector - keep only display formats and essential context
  for (const [selector, matches] of Object.entries(registry.bySelector)) {
    minified.bySelector[selector] = matches.map(match => ({
      descriptor: minifyDescriptor(match.descriptor),
      format: match.format,
    }));
  }

  // Process byAddress - keep only minimal info
  for (const [address, matches] of Object.entries(registry.byAddress)) {
    minified.byAddress[address] = matches.map(match =>
      minifyDescriptor(match)
    );
  }

  return minified;
}

/**
 * Minify a single descriptor
 */
function minifyDescriptor(descriptor) {
  const minified = {
    display: descriptor.display,
    context: {
      contract: descriptor.context?.contract ? {
        deployments: descriptor.context.contract.deployments,
        // Remove full ABI - it's huge and can be fetched from Sourcify
      } : undefined,
    },
  };

  // Keep metadata if present (small)
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

async function build() {
  console.log('Building ERC-7730 SDK...\n');

  // Read the registry JSON
  console.log('Loading registry...');
  const registryContent = await readFile(REGISTRY_JSON, 'utf-8');
  const registry = JSON.parse(registryContent);
  console.log(`  ✓ Loaded ${registry.stats.descriptors} descriptors from ${registry.stats.protocols} protocols`);

  // Minify the registry
  console.log('\nMinifying registry (removing ABIs)...');
  const minifiedRegistry = minifyRegistry(registry);
  const originalSize = JSON.stringify(registry).length;
  const minifiedSize = JSON.stringify(minifiedRegistry).length;
  const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
  console.log(`  ✓ Reduced from ${(originalSize / 1024).toFixed(0)}KB to ${(minifiedSize / 1024).toFixed(0)}KB (${reduction}% smaller)`);

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
  try {
    const { globSync } = await import('glob');
    const mapFiles = globSync('**/*.map', { cwd: DIST_DIR });
    for (const file of mapFiles) {
      await rm(join(DIST_DIR, file));
    }
    console.log(`  ✓ Removed ${mapFiles.length} sourcemap files`);
  } catch (err) {
    // glob might not be available, try manual approach
    console.log('  ⚠ Could not remove sourcemaps (glob not available)');
  }

  console.log('\n✅ Build complete!');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
