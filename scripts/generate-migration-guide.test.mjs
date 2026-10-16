import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrationRows, reportSurface } from './generate-migration-guide.mjs';

const report = (code) => `## API Report\n\n\`\`\`ts\n${code}\n\`\`\`\n`;

test('reads exported declarations and deprecated public methods, deduplicating overloads', () => {
  const surface = reportSurface(
    report(`
export const value: string;
export type Input = string;
export function run(input: string): void;
export function run(input: number): void;
export class Signer {
  // @deprecated Use decodeTransaction.
  decode(input: Input): void;
  decodeTransaction(input: Input): void;
  private hidden;
}
`)
  );
  assert.deepEqual([...surface.symbols], ['value', 'Input', 'run', 'Signer']);
  assert.deepEqual([...surface.members], ['Signer.decode', 'Signer.decodeTransaction']);
  assert.deepEqual([...surface.deprecatedMembers], ['Signer.decode']);
  assert.throws(() => reportSurface('no API report'), /TypeScript fence/);
});

test('compares entries and methods without reporting retained symbols or new exports', () => {
  const before = {
    '@erc7730/sdk': report(`export class Signer {
      // @deprecated Use decodeTransaction.
      decode(): void;
      decodeTransaction(): void;
    }`),
    '@erc7730/sdk/legacy': report('export type OldInput = string;'),
  };
  const after = {
    '@erc7730/sdk': report(`export class Signer { decodeTransaction(): void; }
      export function added(): void;`),
  };
  assert.deepEqual(
    migrationRows(before, after, {
      'Signer.decode': 'Use decodeTransaction.',
      OldInput: 'Use Input.',
    }),
    [
      '| `@erc7730/sdk` | `Signer.decode` | Use decodeTransaction. |',
      '| `@erc7730/sdk/legacy` | `OldInput` | Use Input. |',
    ]
  );
  assert.throws(() => migrationRows(before, after, {}), /Missing migration advice/);
  assert.deepEqual(migrationRows(before, before, {}), []);
});
