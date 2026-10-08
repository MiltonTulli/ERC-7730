import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('@erc7730/sdk import', () => {
  it('has sideEffects false and registers no loader or global', async () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
      sideEffects?: boolean;
      dependencies?: Record<string, string>;
    };
    expect(pkg.sideEffects).toBe(false);
    expect(pkg.dependencies?.ajv).toEqual(expect.any(String));
    expect(pkg.dependencies?.['ajv-formats']).toEqual(expect.any(String));

    const before = new Set(Reflect.ownKeys(globalThis));
    await import('../index');
    expect(Reflect.ownKeys(globalThis).filter((key) => !before.has(key))).toEqual([]);
  });
});
