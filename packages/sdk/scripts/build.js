#!/usr/bin/env node

/**
 * Build script for the ERC-7730 SDK
 *
 * This script:
 * 1. Copies the registry JSON from the registry package
 * 2. Generates a TypeScript file that embeds the registry
 * 3. Runs the TypeScript compiler
 */

import { readFile, writeFile, mkdir, cp } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_JSON = join(ROOT, '..', 'registry', 'dist', 'registry.json');
const OUTPUT_DIR = join(ROOT, 'src', 'registry');

async function build() {
  console.log('Building ERC-7730 SDK...\n');

  // Read the registry JSON
  console.log('Loading registry...');
  const registryContent = await readFile(REGISTRY_JSON, 'utf-8');
  const registry = JSON.parse(registryContent);
  console.log(`  ✓ Loaded ${registry.stats.descriptors} descriptors from ${registry.stats.protocols} protocols`);

  // Generate the embedded registry module
  console.log('\nGenerating embedded registry...');
  const embeddedContent = `/**
 * Embedded ERC-7730 Registry
 *
 * Auto-generated from @erc7730/registry - DO NOT EDIT
 * Generated: ${new Date().toISOString()}
 *
 * Stats:
 * - Protocols: ${registry.stats.protocols}
 * - Descriptors: ${registry.stats.descriptors}
 * - Selectors: ${registry.stats.selectors}
 * - Addresses: ${registry.stats.addresses}
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EMBEDDED_REGISTRY: any = ${JSON.stringify(registry)};

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

  console.log('\n✅ Build complete!');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
