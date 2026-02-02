#!/usr/bin/env node

/**
 * Import descriptors from Ledger's ERC-7730 registry
 *
 * Usage: node scripts/import-ledger.js
 *
 * This script fetches all descriptors from:
 * https://github.com/LedgerHQ/clear-signing-erc7730-registry
 *
 * And saves them to our local registry maintaining the same structure.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESCRIPTORS_DIR = join(__dirname, '..', 'descriptors');

const GITHUB_API = 'https://api.github.com/repos/LedgerHQ/clear-signing-erc7730-registry/contents/registry';
const RAW_BASE = 'https://raw.githubusercontent.com/LedgerHQ/clear-signing-erc7730-registry/master/registry';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'erc7730-sdk'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchRaw(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'erc7730-sdk'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function importFromLedger() {
  console.log('Importing descriptors from Ledger registry...\n');

  try {
    // Get list of protocol directories
    const protocols = await fetchJson(GITHUB_API);

    let imported = 0;
    let failed = 0;

    for (const protocol of protocols) {
      if (protocol.type !== 'dir') continue;

      const protocolName = protocol.name;
      console.log(`\n📁 ${protocolName}`);

      // Get files in protocol directory
      const files = await fetchJson(`${GITHUB_API}/${protocolName}`);

      for (const file of files) {
        if (!file.name.endsWith('.json')) continue;

        try {
          // Fetch the raw JSON content
          const content = await fetchRaw(`${RAW_BASE}/${protocolName}/${file.name}`);

          // Validate it's valid JSON
          JSON.parse(content);

          // Save to our registry
          const outputDir = join(DESCRIPTORS_DIR, protocolName);
          await mkdir(outputDir, { recursive: true });
          await writeFile(join(outputDir, file.name), content);

          console.log(`  ✓ ${file.name}`);
          imported++;
        } catch (err) {
          console.error(`  ✗ ${file.name}: ${err.message}`);
          failed++;
        }
      }

      // Rate limiting - be nice to GitHub
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n✅ Imported ${imported} descriptors`);
    if (failed > 0) {
      console.log(`⚠️  Failed: ${failed}`);
    }

  } catch (err) {
    console.error('Failed to import from Ledger:', err.message);
    process.exit(1);
  }
}

importFromLedger();
