#!/usr/bin/env node

/**
 * Build script for the ERC-7730 registry
 *
 * This script:
 * 1. Reads all descriptor JSON files from descriptors/
 * 2. Builds a single bundled registry file
 * 3. Creates an index for fast lookups by selector and address
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DESCRIPTORS_DIR = join(ROOT, 'descriptors');
const DIST_DIR = join(ROOT, 'dist');

async function getAllFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await getAllFiles(path, files);
    } else if (entry.name.endsWith('.json') && !entry.name.startsWith('.')) {
      files.push(path);
    }
  }

  return files;
}

/**
 * Compute function selector from signature
 */
function computeSelector(signature) {
  // Skip if already a selector
  if (signature.startsWith('0x')) {
    return signature.toLowerCase();
  }

  // Compute keccak256 hash and take first 4 bytes
  const hash = createHash('sha3-256').update(signature).digest('hex');
  return `0x${hash.slice(0, 8)}`;
}

async function build() {
  console.log('Building ERC-7730 registry...\n');

  // Ensure dist directory exists
  await mkdir(DIST_DIR, { recursive: true });

  // Get all descriptor files
  const files = await getAllFiles(DESCRIPTORS_DIR);
  console.log(`Found ${files.length} descriptor files\n`);

  // Build registry
  const registry = {
    $schema: 'erc7730-registry-v1',
    version: '1.0.0',
    generated: new Date().toISOString(),
    stats: {
      protocols: 0,
      descriptors: 0,
      selectors: 0,
      addresses: 0,
    },
    // Index by selector -> array of descriptor IDs
    bySelector: {},
    // Index by chainId:address -> array of descriptor IDs
    byAddress: {},
    // All descriptors by ID
    descriptors: {},
  };

  const protocols = new Set();
  let descriptorId = 0;

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const descriptor = JSON.parse(content);

      // Get relative path for identification
      const relativePath = file.replace(`${DESCRIPTORS_DIR}/`, '');
      const protocol = relativePath.split('/')[0];
      protocols.add(protocol);

      // Generate unique ID
      const id = `d${descriptorId++}`;

      // Store descriptor (minimal version for bundle size)
      registry.descriptors[id] = {
        protocol,
        file: relativePath,
        context: descriptor.context,
        metadata: descriptor.metadata,
        display: descriptor.display,
      };

      // Index by function selector
      if (descriptor.display?.formats) {
        for (const signature of Object.keys(descriptor.display.formats)) {
          const selector = signature.startsWith('0x')
            ? signature.toLowerCase()
            : computeSelector(signature);

          if (!registry.bySelector[selector]) {
            registry.bySelector[selector] = [];
          }
          registry.bySelector[selector].push(id);
        }
      }

      // Index by contract address
      const deployments = descriptor.context?.contract?.deployments || [];
      for (const deployment of deployments) {
        if (deployment.address && deployment.chainId) {
          const key = `${deployment.chainId}:${deployment.address.toLowerCase()}`;
          if (!registry.byAddress[key]) {
            registry.byAddress[key] = [];
          }
          registry.byAddress[key].push(id);
        }
      }

      console.log(`  ✓ ${relativePath}`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  // Update stats
  registry.stats.protocols = protocols.size;
  registry.stats.descriptors = Object.keys(registry.descriptors).length;
  registry.stats.selectors = Object.keys(registry.bySelector).length;
  registry.stats.addresses = Object.keys(registry.byAddress).length;

  // Write full registry (for SDK embedding)
  await writeFile(join(DIST_DIR, 'registry.json'), JSON.stringify(registry, null, 2));

  // Write minified version
  await writeFile(join(DIST_DIR, 'registry.min.json'), JSON.stringify(registry));

  // Write TypeScript module for SDK import
  const tsContent = `// Auto-generated - do not edit
// Generated: ${registry.generated}

import type { ERC7730Registry } from '../types/registry.js';

export const REGISTRY: ERC7730Registry = ${JSON.stringify(registry, null, 2)} as const;

export default REGISTRY;
`;

  await writeFile(join(DIST_DIR, 'registry.ts'), tsContent);

  // Write stats
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✓ Protocols: ${registry.stats.protocols}`);
  console.log(`✓ Descriptors: ${registry.stats.descriptors}`);
  console.log(`✓ Selectors indexed: ${registry.stats.selectors}`);
  console.log(`✓ Addresses indexed: ${registry.stats.addresses}`);
  console.log('='.repeat(50));

  const fullSize = (await readFile(join(DIST_DIR, 'registry.json'))).length;
  const minSize = (await readFile(join(DIST_DIR, 'registry.min.json'))).length;

  console.log('\nOutput files:');
  console.log(`  dist/registry.json     ${(fullSize / 1024).toFixed(1)} KB`);
  console.log(`  dist/registry.min.json ${(minSize / 1024).toFixed(1)} KB`);
  console.log('  dist/registry.ts       (for SDK embedding)');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
