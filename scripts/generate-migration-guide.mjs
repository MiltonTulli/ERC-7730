import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = join(root, 'api/baselines/0.12.0');

// Replacement advice is editorial; membership in the table comes from API reports.
const replacements = {
  AddressNameParams: 'Derive field params from `InputDescriptor`.',
  ClearSigner: '`createClearSigner(options)` from `@erc7730/sdk`.',
  'ClearSigner.decode': '`createClearSigner(options).decodeTransaction(tx)`.',
  ClearSignerConfig: '`DecodeOptions` from `@erc7730/sdk`.',
  COMMON_SIGNATURES: 'No public replacement. Pass a per-call `DecodeOptions.signatures` map.',
  computeSelector: 'No SDK replacement. Use your ABI library to compute selectors.',
  ContractContext: 'Derive the contract binding from `InputDescriptor["context"]`.',
  ContractDeployment:
    '`ResolvedDeployment` for resolved bindings; derive input deployments from `InputDescriptor`.',
  createMemoryIncludeLoader: 'Implement `IncludeLoader.load(ref, from)`; see the example below.',
  DateParams: 'Derive field params from `InputDescriptor`.',
  decodeCalldata:
    '`decodeTransaction(tx, options)` for a decoded operation; use your ABI library for raw arguments.',
  DEFAULT_OFFICIAL_REGISTRY_BASE_URL:
    'Use the default of `createOfficialRegistry()` or set `OfficialRegistryConfig.baseUrl`.',
  EIP1967_IMPLEMENTATION_SLOT:
    'No public replacement. `matchContext` handles proxy bindings with a `Provider`.',
  EnumParams: 'Derive field params from `InputDescriptor`.',
  ERC7730Context: '`NonNullable<InputDescriptor["context"]>`.',
  ERC7730Descriptor: '`InputDescriptor` from `@erc7730/sdk`.',
  ERC7730Display: '`NonNullable<InputDescriptor["display"]>`.',
  ERC7730Metadata: '`NonNullable<InputDescriptor["metadata"]>`.',
  ERC7730V2Descriptor: '`InputDescriptor` from `@erc7730/sdk`.',
  extractSelector:
    'No SDK replacement. Validate calldata, then take its first four bytes (`data.slice(0, 10)`).',
  FieldDefinition: 'Derive display fields from `InputDescriptor`.',
  FieldFormatter: 'Derive display fields from `InputDescriptor`.',
  format: '`decodeTransaction(tx, options)` from `@erc7730/sdk`.',
  formatAddress: 'Render `DecodedField.value`, or format addresses in the wallet UI.',
  formatAmount: 'Render `DecodedField.value`; read structured amounts from `TokenAmountDetails`.',
  FormatParams: 'Derive field params from `InputDescriptor`.',
  formatTypedData: '`decodeTypedData(data, options)` from `@erc7730/sdk`.',
  FunctionFormat: 'Derive format entries from `InputDescriptor["display"]`.',
  getDefaultClearSignRegistry:
    '`clearSign(input)` owns the default; use `createOfficialRegistry()` for an explicit registry.',
  getSignatureBySelector:
    'No public replacement. Pass `DecodeOptions.signatures` or use your ABI library.',
  getTokenInfo:
    'Supply `ExternalDataProvider.resolveToken`; curated metadata is opt-in via `knownDataProvider()` on `@erc7730/sdk/known-data`.',
  isCommitSha: 'No SDK replacement. Validate a full SHA with `/^[0-9a-f]{40}$/i`.',
  isInfiniteApproval: 'Inspect decoded warnings for `type === "infinite_approval"`.',
  NATIVE_CURRENCY:
    'No exported constant. Supply native-currency metadata through `ExternalDataProvider.resolveChainInfo`.',
  OFFICIAL_REGISTRY_REPO:
    'No exported constant. The default registry is `ethereum/clear-signing-erc7730-registry`.',
  Registry:
    '`createOfficialRegistry()` for pinned lookups, or `createClearSigner().extend(...)` for local overrides.',
  RegistryFieldFormat:
    '`FieldFormat` for decoded results; derive descriptor formats from `InputDescriptor`.',
  resolveAddress:
    'Render decoded fields; provide address lookup through `Provider.getEnsName` or `ExternalDataProvider.resolveLocalName`.',
  resolveImplementation: '`matchContext` with a `Provider` for proxy-aware descriptor matching.',
  toCaip10: 'Construct `eip155:${chainId}:${address.toLowerCase()}`; type the result as `Caip10`.',
  TokenAmountParams: 'Derive field params from `InputDescriptor`.',
  UnitParams: 'Derive field params from `InputDescriptor`.',
  ValidationError: '`ValidationIssue` from `@erc7730/sdk`.',
};

/** Extract exported names and class members from an API Extractor report. */
export function reportSurface(report) {
  const code = report.match(/```ts\r?\n([\s\S]*?)```/)?.[1];
  if (code === undefined) {
    throw new Error('Expected an API Extractor TypeScript fence');
  }
  const file = ts.createSourceFile('report.ts', code, ts.ScriptTarget.Latest, true);
  const symbols = new Set();
  const members = new Set();
  const deprecatedMembers = new Set();
  for (const statement of file.statements) {
    if (!(ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        symbols.add(declaration.name.getText(file));
      }
    } else if (statement.name) {
      symbols.add(statement.name.getText(file));
    }
    if (!ts.isClassDeclaration(statement) || !statement.name) {
      continue;
    }
    for (const member of statement.members) {
      const flags = ts.getCombinedModifierFlags(member);
      if (!member.name || flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) {
        continue;
      }
      const name = `${statement.name.text}.${member.name.getText(file)}`;
      members.add(name);
      if (member.getFullText(file).includes('@deprecated')) {
        deprecatedMembers.add(name);
      }
    }
  }
  return { symbols, members, deprecatedMembers };
}

/** Report removed exports and deprecated methods, refusing undocumented removals. */
export function migrationRows(before, after, advice = replacements) {
  const rows = [];
  for (const [entry, report] of Object.entries(before).sort(([a], [b]) => a.localeCompare(b))) {
    const old = reportSurface(report);
    const current = after[entry] ? reportSurface(after[entry]) : undefined;
    const removed = [
      ...[...old.symbols].filter((name) => !current?.symbols.has(name)),
      ...[...old.deprecatedMembers].filter((name) => !current?.members.has(name)),
    ].sort();
    for (const name of removed) {
      if (!Object.hasOwn(advice, name)) {
        throw new Error(`Missing migration advice for ${entry}: ${name}`);
      }
      rows.push(`| \`${entry}\` | \`${name}\` | ${advice[name]} |`);
    }
  }
  return rows;
}

function readReports(directory) {
  return Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.api.md'))
      .sort()
      .map((name) => {
        const suffix = name.slice('sdk'.length, -'.api.md'.length).replace(/^-/, '/');
        return [`@erc7730/sdk${suffix}`, readFileSync(join(directory, name), 'utf8')];
      })
  );
}

function main() {
  const rows = migrationRows(readReports(baseline), readReports(join(root, 'api')));
  const file = join(root, 'docs/migrating-to-1.0.md');
  const source = readFileSync(file, 'utf8');
  const pattern = /<!-- migration:start -->[\s\S]*?<!-- migration:end -->/;
  if (!pattern.test(source)) {
    throw new Error('Missing migration table markers');
  }
  const table = [
    '<!-- migration:start -->',
    '| 0.12 import | Old symbol | 1.0 replacement |',
    '| --- | --- | --- |',
    ...rows,
    '<!-- migration:end -->',
  ].join('\n');
  const output = source.replace(pattern, () => table);
  if (process.argv.includes('--check')) {
    if (source !== output) {
      throw new Error('Migration table is stale. Run node scripts/generate-migration-guide.mjs');
    }
  } else {
    writeFileSync(file, output);
  }
  console.log(`Migration table: ${rows.length} removals documented`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
