import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDORED_REGISTRY_COMMIT, validateDescriptor } from '@erc7730/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../run.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const sdkFixtures = join(here, '../../../sdk/src/__tests__/fixtures');
const PIN = VENDORED_REGISTRY_COMMIT;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const ERC20_ABI = join(fixtures, 'erc20.abi.json');

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'erc7730-cli-'));
  dirs.push(dir);
  return dir;
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function mockFetch(files: Record<string, unknown>): typeof fetch {
  return async (input) => {
    const url = String(input);
    const marker = `/${PIN}/`;
    const idx = url.indexOf(marker);
    const path = idx === -1 ? url : url.slice(idx + marker.length);
    if (!(path in files)) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(files[path]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function officialFiles(): Record<string, unknown> {
  return {
    'index.calldata.json': {
      'eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'registry/weth/calldata-weth.json',
    },
    'index.eip712.json': {},
    'registry/weth/calldata-weth.json': loadJson(
      join(sdkFixtures, 'official/weth-calldata-weth.json')
    ),
  };
}

function io(overrides?: {
  cwd?: string;
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}) {
  return {
    cwd: overrides?.cwd ?? here,
    env: overrides?.env ?? {},
    fetch: overrides?.fetch ?? mockFetch(officialFiles()),
    homedir: tmpdir(),
    stdin: overrides?.stdin,
  };
}

describe('erc7730 generate', () => {
  it('prints a v2-valid descriptor from an ERC-20 ABI', async () => {
    const result = await runCli(
      [
        'generate',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        ERC20_ABI,
        '--owner',
        'Example',
        '--url',
        'https://example.com',
      ],
      io()
    );

    expect(result.exitCode).toBe(0);
    const draft = JSON.parse(result.stdout) as Record<string, unknown>;
    const validated = validateDescriptor(draft);
    expect(validated, JSON.stringify(validated)).toMatchObject({ ok: true, version: '2' });
    expect(String(draft.$schema)).toContain('erc7730-v2');

    const display = draft.display as {
      formats: Record<string, { intent?: string; fields: unknown[] }>;
    };
    expect(display.formats['transfer(address,uint256)']?.intent).toBe('Transfer');
    expect(display.formats['approve(address,uint256)']).toBeTruthy();
    expect(display.formats['balanceOf(address)']).toBeUndefined();

    const setCollection = display.formats['setCollection(address)'];
    const nftField = (setCollection.fields as Array<{ params?: { types?: string[] } }>)[0];
    expect(nftField.params?.types).toEqual(['collection']);
  });

  it('writes a file that lints without errors', async () => {
    const dir = await tempDir();
    const out = join(dir, 'calldata-example.json');
    const generated = await runCli(
      [
        'generate',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        ERC20_ABI,
        '--owner',
        'Example',
        '--out',
        out,
      ],
      io({ cwd: dir })
    );
    expect(generated.exitCode).toBe(0);
    const linted = await runCli(['lint', out], io({ cwd: dir }));
    expect(linted.exitCode).toBe(0);
  });

  it('fails without required flags', async () => {
    const result = await runCli(['generate', '--chain-id', '1'], io());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/--address is required/);
  });
});

describe('erc7730 lint', () => {
  it('exits 0 on a valid official v2 descriptor', async () => {
    const result = await runCli(
      ['lint', join(sdkFixtures, 'official/weth-calldata-weth.json')],
      io()
    );
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/0 error\(s\)/);
  });

  it('exits 1 when schema validation reports errors', async () => {
    const result = await runCli(['lint', join(fixtures, 'invalid-extra.json'), '--json'], io());
    expect(result.exitCode).toBe(1);
    const reports = JSON.parse(result.stdout) as Array<{
      issues: Array<{ level: string; path: string }>;
    }>;
    expect(
      reports[0].issues.some((issue) => issue.level === 'error' && issue.path.includes('extra'))
    ).toBe(true);
  });

  it('exits 1 when the file is missing', async () => {
    const result = await runCli(['lint', 'no-such-file.json'], io());
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/File not found/);
  });
});

describe('erc7730 preview', () => {
  it('prints intent and fields for a WETH deposit', async () => {
    const result = await runCli(
      [
        'preview',
        '--data',
        '0xd0e30db0',
        '--to',
        WETH,
        '--chain-id',
        '1',
        '--value',
        '1000000000000000000',
        '--pin',
        PIN,
      ],
      io()
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Intent: Wrap/);
    expect(result.stdout).toMatch(/Amount/);
    expect(result.stdout).toMatch(/1 ETH/);
    expect(result.stdout).toMatch(/official-registry/);
  });
});

describe('erc7730 diff', () => {
  it('exits 0 when the local file matches official intent and fields', async () => {
    const result = await runCli(
      [
        'diff',
        join(sdkFixtures, 'official/weth-calldata-weth.json'),
        '--against',
        'official',
        '--pin',
        PIN,
      ],
      io()
    );
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/No differences/);
  });

  it('exits 1 when intent differs from official', async () => {
    const dir = await tempDir();
    const local = join(dir, 'calldata-weth.json');
    const official = loadJson(join(sdkFixtures, 'official/weth-calldata-weth.json')) as {
      display: { formats: Record<string, { intent: string }> };
    };
    official.display.formats['deposit()'].intent = 'Something else';
    await writeFile(local, `${JSON.stringify(official, null, 2)}\n`);

    const result = await runCli(
      ['diff', local, '--against', 'official', '--pin', PIN],
      io({ cwd: dir })
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/deposit\(\)\.intent/);
  });
});

describe('erc7730 registry update', () => {
  it('writes indexes and referenced descriptors into the cache', async () => {
    const dir = await tempDir();
    const result = await runCli(
      ['registry', 'update', '--pin', PIN, '--cache-dir', dir],
      io({ fetch: mockFetch(officialFiles()) })
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Updated/);
    const written = await readFile(
      join(dir, 'registry', PIN, 'registry/weth/calldata-weth.json'),
      'utf8'
    );
    expect(written).toContain('Wrap');
  });
});

describe('erc7730 help', () => {
  it('prints usage for --help', async () => {
    const result = await runCli(['--help'], io());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/generate/);
    expect(result.stdout).toMatch(/lint/);
    expect(result.stdout).toMatch(/preview/);
    expect(result.stdout).toMatch(/diff/);
  });
});
