import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type InputDescriptor, VENDORED_REGISTRY_COMMIT, validateDescriptor } from '@erc7730/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../run';
import { GENERATED_COMMENT, V2_SCHEMA_URI } from '../types';
import { toV2Draft } from '../v2';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const sdkFixtures = join(here, '../../../sdk/src/__tests__/fixtures');
const PIN = VENDORED_REGISTRY_COMMIT;
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
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
      'eip155:11155111:0xfff9976782d46cc05630d1f6ebab18b2324d6b14':
        'registry/weth/calldata-weth.json',
      'eip155:1:0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'registry/lido/calldata-stETH.json',
    },
    'index.eip712.json': {},
    'registry/weth/calldata-weth.json': loadJson(
      join(sdkFixtures, 'official/weth-calldata-weth.json')
    ),
    'registry/lido/calldata-stETH.json': loadJson(
      join(sdkFixtures, 'official/lido-calldata-stETH.json')
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

  it('reads an ABI from stdin when the binary is invoked with --abi -', () => {
    const binary = join(here, '../../dist/index.js');
    expect(existsSync(binary), 'build @erc7730/cli before this test').toBe(true);
    const stdout = execFileSync(
      process.execPath,
      [
        binary,
        'generate',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        '-',
        '--owner',
        'Example',
      ],
      { input: readFileSync(ERC20_ABI, 'utf8'), encoding: 'utf8' }
    );
    const draft = JSON.parse(stdout) as { $schema?: string };
    expect(String(draft.$schema)).toContain('erc7730-v2');
  });

  it('does not wait on stdin for help or non-generate commands', async () => {
    const binary = join(here, '../../dist/index.js');
    expect(existsSync(binary), 'build @erc7730/cli before this test').toBe(true);

    async function runWithoutClosingStdin(args: string[]): Promise<string> {
      const child = spawn(process.execPath, [binary, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        output += chunk;
      });
      // The binary loads the SDK before printing help. A blocked stdin read never
      // exits; a slow runner can take longer than a second and still be fine.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill();
          const seen = output.trim() ? ` output: ${output.trim().slice(0, 120)}` : '';
          reject(new Error(`timed out waiting for: erc7730 ${args.join(' ')}${seen}`));
        }, 10_000);
        child.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      return output;
    }

    await expect(runWithoutClosingStdin(['--help', '--abi', '-'])).resolves.toMatch(/Usage/);
    await expect(runWithoutClosingStdin(['generate', '--help', '--abi', '-'])).resolves.toMatch(
      /--abi/
    );
    await expect(runWithoutClosingStdin(['lint', '--abi', '-'])).resolves.toMatch(/Unknown option/);
  }, 35_000);
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
    expect(result.stdout).toMatch(/schema erc7730-v2 · 1 format · includes: 0 resolved/);
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

  it('names a bogus format in at most three lines', async () => {
    const dir = await tempDir();
    const file = join(dir, 'bogus.json');
    await writeFile(
      file,
      JSON.stringify({
        $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
        context: {
          contract: {
            deployments: [{ chainId: 1, address: WETH }],
          },
        },
        display: {
          formats: {
            'transfer(address,uint256)': {
              intent: 'Transfer',
              fields: [{ path: 'to', label: 'To', format: 'bogusFormat' }],
            },
          },
        },
      })
    );

    const result = await runCli(['lint', file], io({ cwd: dir }));
    const lines = result.stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line !== '');

    expect(result.exitCode).toBe(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(result.stdout).toContain('bogusFormat');
    expect(result.stdout).toMatch(/must be one of: .*tokenAmount/);
  });

  it('says a file without context and display does not look like a descriptor', async () => {
    const dir = await tempDir();
    const file = join(dir, 'empty.json');
    await writeFile(file, '{}\n');

    const result = await runCli(['lint', file], io({ cwd: dir }));
    const lines = result.stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line !== '');

    expect(result.exitCode).toBe(1);
    expect(lines[0]).toBe('this does not look like an ERC-7730 descriptor');
  });

  it('exits 1 when the file is missing', async () => {
    const result = await runCli(['lint', 'no-such-file.json'], io());
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/File not found/);
    expect(result.stdout).not.toMatch(/this does not look like an ERC-7730 descriptor/);
  });

  it('walks formats from a resolved include', async () => {
    const result = await runCli(['lint', join(fixtures, 'with-include.json')], io());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/missing_display/);
    expect(result.stdout).not.toMatch(/missing_formats/);
    expect(result.stdout).toMatch(/schema erc7730-v2 · 1 format · includes: 1 resolved/);
  });

  it('lints a registry descriptor that includes ercs/', async () => {
    const file = join(here, '../../../registry/descriptors/tether/calldata-usdt.json');
    const result = await runCli(['lint', file], io());
    expect(result.stdout).not.toMatch(/Failed to load include/);
    expect(result.stdout).toMatch(/schema erc7730-v1 · \d+ formats · includes: 1 resolved/);
    expect(result.exitCode).toBe(0);
  });

  it('validates testsv2 files with --tests', async () => {
    const dir = await tempDir();
    const testsPath = join(dir, 'sample.tests.json');
    await writeFile(
      testsPath,
      JSON.stringify({
        descriptor: '../calldata-sample.json',
        tests: [
          {
            description: 'sample',
            rawTx: '0xd0e30db0',
            expected: { intent: 'Wrap', fields: [] },
          },
        ],
      }),
      'utf8'
    );
    const ok = await runCli(['lint', '--tests', testsPath], io({ cwd: dir }));
    expect(ok.exitCode).toBe(0);

    await writeFile(testsPath, JSON.stringify({ descriptor: '../x.json', tests: [] }), 'utf8');
    const bad = await runCli(['lint', '--tests', testsPath, '--json'], io({ cwd: dir }));
    expect(bad.exitCode).toBe(1);
  });
});

describe('erc7730 scaffold', () => {
  it('writes calldata + testsv2 tree', async () => {
    const dir = await tempDir();
    const out = join(dir, 'draft');
    const result = await runCli(
      [
        'scaffold',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        ERC20_ABI,
        '--owner',
        'WETH',
        '--out',
        out,
      ],
      io({ cwd: dir })
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/calldata-weth\.json/);
    expect(result.stdout).toMatch(/calldata-weth\.tests\.json/);
    expect(result.stdout).toMatch(/testsv2/);
    const linted = await runCli(['lint', join(out, 'calldata-weth.json')], io({ cwd: dir }));
    expect(linted.exitCode).toBe(0);
    const tests = await runCli(['lint', '--tests', join(out, 'testsv2')], io({ cwd: dir }));
    expect(tests.exitCode).toBe(0);

    const again = await runCli(
      [
        'scaffold',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        ERC20_ABI,
        '--owner',
        'WETH',
        '--out',
        out,
      ],
      io({ cwd: dir })
    );
    expect(again.exitCode).toBe(1);
    expect(again.stderr).toMatch(/Refusing to overwrite/);

    const forced = await runCli(
      [
        'scaffold',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        ERC20_ABI,
        '--owner',
        'WETH',
        '--out',
        out,
        '--force',
      ],
      io({ cwd: dir })
    );
    expect(forced.exitCode).toBe(0);
  });
});

describe('erc7730 preview', () => {
  it('prints intent and trust for a WETH deposit', async () => {
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
    expect(result.stdout).toMatch(/Trust: accepted/);
    expect(result.stdout).toMatch(/Amount/);
    expect(result.stdout).toMatch(/1 ETH/);
    expect(result.stdout).toMatch(/official-registry/);
    expect(result.stdout).toContain(`Pin: ${PIN} (--pin)`);
  });

  it('prints the diagnostic chain with --explain', async () => {
    const hit = await runCli(
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
        '--explain',
      ],
      io()
    );
    expect(hit.exitCode).toBe(0);
    expect(hit.stdout).toMatch(/registry-lookup REGISTRY_HIT hit/);
    expect(hit.stdout).toMatch(/format-match FORMAT_MATCHED hit/);
    expect(hit.stdout).toMatch(/trust TRUST_ACCEPTED hit/);

    const miss = await runCli(
      [
        'preview',
        '--explain',
        '--data',
        '0xdeadbeef',
        '--to',
        '0x1111111111111111111111111111111111111111',
        '--chain-id',
        '1',
        '--pin',
        PIN,
      ],
      io()
    );
    expect(miss.exitCode).toBe(0);
    expect(miss.stdout).toMatch(/registry-lookup REGISTRY_NO_DESCRIPTOR miss/);
  });

  it('prints the vendored pin when --pin is omitted', async () => {
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
      ],
      io()
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Pin: ${PIN} (vendored default)`);
    expect(result.stdout).toMatch(/Trust: accepted \(official-only\)/);
  });

  it('selects the trust policy with --policy', async () => {
    const args = [
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
    ];
    const fetch = mockFetch({ 'index.calldata.json': {}, 'index.eip712.json': {} });

    const rejected = await runCli(args, io({ fetch }));
    expect(rejected.exitCode).toBe(0);
    expect(rejected.stdout).toMatch(/Trust: rejected \(official-only\)/);

    const local = await runCli([...args, '--policy', 'official-or-local'], io({ fetch }));
    expect(local.exitCode).toBe(0);
    expect(local.stdout).toMatch(/Trust: accepted \(official-or-local\)/);

    const none = await runCli([...args, '--policy', 'none'], io({ fetch }));
    expect(none.exitCode).toBe(0);
    expect(none.stdout).toMatch(/Trust: accepted \(none\)/);

    const invalid = await runCli([...args, '--policy', 'all'], io({ fetch }));
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toMatch(/--policy must be official-only, official-or-local, or none/);
  });

  it('prints the env pin when ERC7730_REGISTRY_PIN is set', async () => {
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
      ],
      io({ env: { ERC7730_REGISTRY_PIN: PIN } })
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Pin: ${PIN} (ERC7730_REGISTRY_PIN)`);
  });

  it('prints interpolatedIntent for a Lido submit with --pin', async () => {
    // submit(address) selector 0xa1903eab + zero referral
    const data = '0xa1903eab0000000000000000000000000000000000000000000000000000000000000000';
    const result = await runCli(
      [
        'preview',
        '--data',
        data,
        '--to',
        STETH,
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
    expect(result.stdout).toMatch(/Interpolated: Stake/);
    expect(result.stdout).toMatch(/Trust: accepted/);
  });

  it('rejects a negative --value', async () => {
    const result = await runCli(
      ['preview', '--data', '0xd0e30db0', '--to', WETH, '--chain-id', '1', '--value=-1'],
      io()
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/non-negative/);
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

  it('exits 1 when a deployment has no official match', async () => {
    const dir = await tempDir();
    const local = join(dir, 'calldata-weth.json');
    const descriptor = loadJson(join(sdkFixtures, 'official/weth-calldata-weth.json')) as {
      context: { contract: { deployments: Array<{ chainId: number; address: string }> } };
    };
    descriptor.context.contract.deployments.push({
      chainId: 1,
      address: '0x0000000000000000000000000000000000000001',
    });
    await writeFile(local, `${JSON.stringify(descriptor, null, 2)}\n`);

    const result = await runCli(
      ['diff', local, '--against', 'official', '--pin', PIN],
      io({ cwd: dir })
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/eip155:1:0x0000000000000000000000000000000000000001/);
  });

  it('exits 1 when the descriptor has no deployments', async () => {
    const erc20 = join(here, '../../../registry/descriptors/erc20/calldata-erc20.json');
    const result = await runCli(['diff', erc20, '--against', 'official', '--pin', PIN], io());

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'descriptor has no deployments to compare; diff needs context.contract.deployments'
    );
    expect(result.stderr).not.toContain('No official descriptor for');
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
    const marker = await readFile(join(dir, 'registry', PIN, '.complete'), 'utf8');
    expect(marker).toBe('');
  });

  it('does not use a cache that never finished updating', async () => {
    const dir = await tempDir();
    const cached = join(dir, 'registry', PIN);
    await mkdir(cached, { recursive: true });
    await writeFile(join(cached, 'index.calldata.json'), '{}\n');

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
      io({ env: { ERC7730_CACHE_DIR: dir } })
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Intent: Wrap/);
  });
});

describe('erc7730 help', () => {
  it('prints usage for --help', async () => {
    const result = await runCli(['--help'], io());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/generate/);
    expect(result.stdout).toMatch(/lint/);
    expect(result.stdout).toMatch(/preview/);
    expect(result.stdout).toMatch(/test/);
    expect(result.stdout).toMatch(/diff/);
  });

  it('prints help when no command is given and the package version when asked', async () => {
    const version = (
      JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8')) as { version: string }
    ).version;

    const missing = await runCli([]);
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toMatch(/Usage: erc7730/);

    const long = await runCli(['--version']);
    const short = await runCli(['-V']);
    expect(long.exitCode).toBe(0);
    expect(long.stdout.trim()).toBe(version);
    expect(short.stdout).toBe(long.stdout);

    const help = await runCli(['-h']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(/Usage: erc7730/);
  });

  it('rejects an unknown command', async () => {
    const result = await runCli(['nope']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Unknown command: nope/);
    expect(result.stderr).toMatch(/Usage: erc7730/);
  });
});

describe('erc7730 lint reports', () => {
  const schema = V2_SCHEMA_URI;

  it('prints help and rejects a missing path or an unknown flag', async () => {
    const help = await runCli(['lint', '-h'], io());
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(/--tests/);

    const missing = await runCli(['lint'], io());
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toMatch(/lint requires a file or directory path/);

    const flag = await runCli(['lint', '--nope'], io());
    expect(flag.exitCode).toBe(1);
    expect(flag.stderr).toMatch(/Unknown option/);
  });

  it('includes the summary on a clean JSON report', async () => {
    const result = await runCli(
      ['lint', '--json', join(sdkFixtures, 'official/weth-calldata-weth.json')],
      io()
    );
    expect(result.exitCode).toBe(0);
    const reports = JSON.parse(result.stdout) as Array<{ summary?: string; unlike?: boolean }>;
    expect(reports[0]?.summary).toBe('schema erc7730-v2 · 1 format · includes: 0 resolved');
    expect(reports[0]?.unlike).toBe(false);
  });

  it('warns when display or a format is incomplete and still prints the summary', async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, 'context-only.json'),
      JSON.stringify({
        $schema: schema,
        context: { contract: { deployments: [{ chainId: 1, address: WETH }] } },
      })
    );
    const contextOnly = await runCli(['lint', 'context-only.json'], io({ cwd: dir }));
    expect(contextOnly.exitCode).toBe(0);
    expect(contextOnly.stdout).toMatch(/missing_display/);
    expect(contextOnly.stdout).toMatch(/schema erc7730-v2 · 0 formats · includes: 0 resolved/);
    expect(contextOnly.stdout).not.toMatch(/this does not look like an ERC-7730 descriptor/);

    await writeFile(
      join(dir, 'empty-formats.json'),
      JSON.stringify({
        $schema: schema,
        context: { contract: { deployments: [{ chainId: 1, address: WETH }] } },
        display: { formats: {} },
      })
    );
    const empty = await runCli(['lint', 'empty-formats.json'], io({ cwd: dir }));
    expect(empty.exitCode).toBe(0);
    expect(empty.stdout).toMatch(/display\.formats is empty/);

    await writeFile(
      join(dir, 'bare-formats.json'),
      JSON.stringify({
        $schema: schema,
        context: { contract: { deployments: [{ chainId: 1, address: WETH }] } },
        display: {
          formats: {
            'deposit()': {},
            'withdraw(uint256)': { intent: 'Withdraw', fields: [] },
          },
        },
      })
    );
    const bare = await runCli(['lint', 'bare-formats.json'], io({ cwd: dir }));
    expect(bare.exitCode).toBe(0);
    expect(bare.stdout).toMatch(/missing_intent/);
    expect(bare.stdout).toMatch(/missing_fields/);
    expect(bare.stdout).toMatch(/schema erc7730-v2 · 2 formats · includes: 0 resolved/);
  });

  it('reports invalid JSON, a non-object, an empty directory, and every JSON file in a tree', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'broken.json'), '{');
    const broken = await runCli(['lint', 'broken.json'], io({ cwd: dir }));
    expect(broken.exitCode).toBe(1);
    expect(broken.stdout).toMatch(/invalid JSON/);
    expect(broken.stdout).not.toMatch(/this does not look like an ERC-7730 descriptor/);

    await writeFile(join(dir, 'list.json'), '[]\n');
    const list = await runCli(['lint', 'list.json'], io({ cwd: dir }));
    expect(list.exitCode).toBe(1);
    expect(list.stdout.split('\n').find((line) => line !== '')).toBe(
      'this does not look like an ERC-7730 descriptor'
    );
    expect(list.stdout).toMatch(/descriptor must be a JSON object/);

    const empty = await tempDir();
    const noJson = await runCli(['lint', empty], io());
    expect(noJson.exitCode).toBe(1);
    expect(noJson.stdout).toMatch(/No JSON files found/);

    const tree = await tempDir();
    await mkdir(join(tree, 'nested'));
    await writeFile(join(tree, 'notes.txt'), 'ignore');
    await writeFile(
      join(tree, 'good.json'),
      JSON.stringify({
        $schema: schema,
        context: { contract: { deployments: [{ chainId: 1, address: WETH }] } },
      })
    );
    await writeFile(join(tree, 'nested', 'also.json'), '{');
    const walked = await runCli(['lint', tree], io({ cwd: tree }));
    expect(walked.exitCode).toBe(1);
    expect(walked.stdout).toMatch(/good\.json:/);
    expect(walked.stdout).toMatch(/missing_display/);
    expect(walked.stdout).toMatch(/also\.json:/);
    expect(walked.stdout).toMatch(/invalid JSON/);
    expect(walked.stdout).not.toMatch(/notes\.txt/);
  });

  it('reports an include that cannot be loaded', async () => {
    const dir = await tempDir();
    const context = { contract: { deployments: [{ chainId: 1, address: WETH }] } };
    await writeFile(
      join(dir, 'missing.json'),
      JSON.stringify({ $schema: schema, includes: 'missing-include.json', context })
    );
    await writeFile(
      join(dir, 'remote.json'),
      JSON.stringify({
        $schema: schema,
        includes: 'https://example.com/extra.json',
        context,
      })
    );

    const missing = await runCli(['lint', 'missing.json'], io({ cwd: dir }));
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toMatch(/Failed to load include "missing-include.json"/);
    expect(missing.stdout).toMatch(/\[unresolved_include\]/);

    const remote = await runCli(['lint', 'remote.json'], io({ cwd: dir }));
    expect(remote.exitCode).toBe(1);
    expect(remote.stdout).toMatch(/Remote include URIs are not fetched/);
  });
});

describe('erc7730 preview edges', () => {
  const deposit = [
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
  ];

  it('prints help and rejects incomplete or malformed arguments', async () => {
    const help = await runCli(['preview', '--help'], io());
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(/--policy/);

    const chain = await runCli(['preview', '--data', '0xd0e30db0', '--to', WETH], io());
    expect(chain.exitCode).toBe(1);
    expect(chain.stderr).toMatch(/--chain-id is required/);

    const negative = await runCli(
      ['preview', '--data', '0xd0e30db0', '--to', WETH, '--chain-id=-1'],
      io()
    );
    expect(negative.exitCode).toBe(1);
    expect(negative.stderr).toMatch(/--chain-id must be a non-negative integer/);

    const to = await runCli(['preview', '--data', '0xd0e30db0', '--chain-id', '1'], io());
    expect(to.exitCode).toBe(1);
    expect(to.stderr).toMatch(/--to is required/);

    const data = await runCli(['preview', '--to', WETH, '--chain-id', '1'], io());
    expect(data.exitCode).toBe(1);
    expect(data.stderr).toMatch(/--data is required/);

    const odd = await runCli(['preview', '--data', '0xabc', '--to', WETH, '--chain-id', '1'], io());
    expect(odd.exitCode).toBe(1);
    expect(odd.stderr).toMatch(/--data must be 0x-prefixed even-length hex/);

    const value = await runCli([...deposit, '--value', 'nope'], io());
    expect(value.exitCode).toBe(1);
    expect(value.stderr).toMatch(/--value must be a decimal integer or 0x-prefixed hex/);

    const from = await runCli([...deposit, '--from', '0x123'], io());
    expect(from.exitCode).toBe(1);
    expect(from.stderr).toMatch(/--from must be a 0x-prefixed 20-byte address/);

    const flag = await runCli(['preview', '--nope'], io());
    expect(flag.exitCode).toBe(1);
    expect(flag.stderr).toMatch(/Unknown option/);
  });

  it('prints JSON, accepts hex value and --from, and can ask Sourcify', async () => {
    const json = await runCli([...deposit, '--json'], io());
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({ intent: 'Wrap' });

    const hexValue = await runCli(
      deposit.map((arg) => (arg === '1000000000000000000' ? '0x0de0b6b3a7640000' : arg)),
      io()
    );
    expect(hexValue.exitCode).toBe(0);
    expect(hexValue.stdout).toMatch(/Intent: Wrap/);
    expect(hexValue.stdout).toMatch(/1 ETH/);

    const from = await runCli(
      [...deposit, '--from', '0x0000000000000000000000000000000000000001'],
      io()
    );
    expect(from.exitCode).toBe(0);
    expect(from.stdout).toMatch(/Intent: Wrap/);

    const sourcify = await runCli([...deposit, '--sourcify'], io());
    expect(sourcify.exitCode).toBe(0);
    expect(sourcify.stdout).toMatch(/Intent: Wrap/);
  });

  it('reads a local registry tree from --registry-path and from a finished cache', async () => {
    const tree = await tempDir();
    await writeTree(tree, officialFiles());
    const offline = async () => {
      throw new Error('network should not be used');
    };

    const flagged = await runCli([...deposit, '--registry-path', tree], io({ fetch: offline }));
    expect(flagged.exitCode).toBe(0);
    expect(flagged.stdout).toMatch(/Intent: Wrap/);

    const cache = await tempDir();
    const root = join(cache, 'registry', PIN);
    await writeTree(root, officialFiles());
    await writeFile(join(root, '.complete'), '');
    const cached = await runCli(deposit, io({ env: { ERC7730_CACHE_DIR: cache }, fetch: offline }));
    expect(cached.exitCode).toBe(0);
    expect(cached.stdout).toMatch(/Intent: Wrap/);
  });
});

describe('erc7730 generate edges', () => {
  it('prints help and rejects missing or unusable ABI input', async () => {
    const help = await runCli(['generate', '--help'], io());
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(/--abi/);

    const abi = await runCli(['generate', '--chain-id', '1', '--address', WETH], io());
    expect(abi.exitCode).toBe(1);
    expect(abi.stderr).toMatch(/--abi is required/);

    const owner = await runCli(
      ['generate', '--chain-id', '1', '--address', WETH, '--abi', ERC20_ABI],
      io()
    );
    expect(owner.exitCode).toBe(1);
    expect(owner.stderr).toMatch(/--owner is required/);

    const address = await runCli(
      ['generate', '--chain-id', '1', '--address', '0x123', '--abi', ERC20_ABI, '--owner', 'Ex'],
      io()
    );
    expect(address.exitCode).toBe(1);
    expect(address.stderr).toMatch(/--address must be a 0x-prefixed 20-byte address/);

    const chain = await runCli(
      ['generate', '--chain-id=-1', '--address', WETH, '--abi', ERC20_ABI, '--owner', 'Ex'],
      io()
    );
    expect(chain.exitCode).toBe(1);
    expect(chain.stderr).toMatch(/--chain-id must be a non-negative integer/);

    const flag = await runCli(['generate', '--nope'], io());
    expect(flag.exitCode).toBe(1);
    expect(flag.stderr).toMatch(/Unknown option/);
  });

  it('reads an ABI artifact from a file and an ABI array from stdin', async () => {
    const dir = await tempDir();
    const artifact = join(dir, 'artifact.json');
    await writeFile(
      artifact,
      JSON.stringify({ abi: JSON.parse(readFileSync(ERC20_ABI, 'utf8')) as unknown })
    );
    const fromFile = await runCli(
      ['generate', '--chain-id', '1', '--address', WETH, '--abi', artifact, '--owner', 'Example'],
      io({ cwd: dir })
    );
    expect(fromFile.exitCode).toBe(0);
    expect(JSON.parse(fromFile.stdout)).toMatchObject({ $schema: V2_SCHEMA_URI });

    const fromStdin = await runCli(
      ['generate', '--chain-id', '1', '--address', WETH, '--abi', '-', '--owner', 'Example'],
      io({ stdin: readFileSync(ERC20_ABI, 'utf8') })
    );
    expect(fromStdin.exitCode).toBe(0);
    expect(JSON.parse(fromStdin.stdout)).toMatchObject({ $schema: V2_SCHEMA_URI });

    const missingStdin = await runCli(
      ['generate', '--chain-id', '1', '--address', WETH, '--abi', '-', '--owner', 'Example'],
      io()
    );
    expect(missingStdin.exitCode).toBe(1);
    expect(missingStdin.stderr).toMatch(/--abi - requires stdin/);

    const badStdin = await runCli(
      ['generate', '--chain-id', '1', '--address', WETH, '--abi', '-', '--owner', 'Example'],
      io({ stdin: '{' })
    );
    expect(badStdin.exitCode).toBe(1);
    expect(badStdin.stderr).toMatch(/stdin: invalid JSON/);

    const notAbi = join(dir, 'not-abi.json');
    await writeFile(notAbi, '{ "name": "Token" }\n');
    const rejected = await runCli(
      ['generate', '--chain-id', '1', '--address', WETH, '--abi', notAbi, '--owner', 'Example'],
      io({ cwd: dir })
    );
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr).toMatch(/expected an ABI array or an artifact object/);
  });
});

describe('erc7730 scaffold edges', () => {
  it('prints help and rejects a missing required flag', async () => {
    const help = await runCli(['scaffold', '--help'], io());
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(/--out/);

    const address = await runCli(['scaffold', '--chain-id', '1'], io());
    expect(address.exitCode).toBe(1);
    expect(address.stderr).toMatch(/--address is required/);

    const abi = await runCli(['scaffold', '--chain-id', '1', '--address', WETH], io());
    expect(abi.exitCode).toBe(1);
    expect(abi.stderr).toMatch(/--abi is required/);

    const owner = await runCli(
      ['scaffold', '--chain-id', '1', '--address', WETH, '--abi', ERC20_ABI],
      io()
    );
    expect(owner.exitCode).toBe(1);
    expect(owner.stderr).toMatch(/--owner is required/);

    const out = await runCli(
      ['scaffold', '--chain-id', '1', '--address', WETH, '--abi', ERC20_ABI, '--owner', 'WETH'],
      io()
    );
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toMatch(/--out is required/);

    const flag = await runCli(['scaffold', '--nope'], io());
    expect(flag.exitCode).toBe(1);
    expect(flag.stderr).toMatch(/Unknown option/);
  });

  it('slugifies the owner and reads an artifact or stdin ABI', async () => {
    const dir = await tempDir();
    const punctuated = await runCli(
      [
        'scaffold',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        ERC20_ABI,
        '--owner',
        ' -Hello- ',
        '--out',
        'hello',
      ],
      io({ cwd: dir })
    );
    expect(punctuated.exitCode).toBe(0);
    expect(punctuated.stdout).toMatch(/calldata-hello\.json/);

    const symbols = await runCli(
      [
        'scaffold',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        ERC20_ABI,
        '--owner',
        '!!!',
        '--out',
        'blank',
      ],
      io({ cwd: dir })
    );
    expect(symbols.exitCode).toBe(0);
    expect(symbols.stdout).toMatch(/calldata-contract\.json/);

    const artifact = join(dir, 'artifact.json');
    await writeFile(
      artifact,
      JSON.stringify({ abi: JSON.parse(readFileSync(ERC20_ABI, 'utf8')) as unknown })
    );
    const fromArtifact = await runCli(
      [
        'scaffold',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        artifact,
        '--owner',
        'Wrapped',
        '--out',
        'wrapped',
      ],
      io({ cwd: dir })
    );
    expect(fromArtifact.exitCode).toBe(0);
    expect(fromArtifact.stdout).toMatch(/calldata-wrapped\.json/);

    const fromStdin = await runCli(
      [
        'scaffold',
        '--chain-id',
        '1',
        '--address',
        WETH,
        '--abi',
        '-',
        '--owner',
        'Stdin',
        '--out',
        'stdin',
      ],
      io({ cwd: dir, stdin: readFileSync(ERC20_ABI, 'utf8') })
    );
    expect(fromStdin.exitCode).toBe(0);
    expect(fromStdin.stdout).toMatch(/calldata-stdin\.json/);
  });
});

describe('erc7730 diff edges', () => {
  async function writeDescriptor(name: string, value: unknown): Promise<string> {
    const dir = await tempDir();
    const file = join(dir, name);
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
    return file;
  }

  function wethDescriptor(): {
    context: { contract: { deployments: Array<{ chainId: number; address: string }> } };
    display: { formats: Record<string, Record<string, unknown>> };
  } {
    return loadJson(join(sdkFixtures, 'official/weth-calldata-weth.json')) as {
      context: { contract: { deployments: Array<{ chainId: number; address: string }> } };
      display: { formats: Record<string, Record<string, unknown>> };
    };
  }

  it('prints help and rejects the wrong file count or target', async () => {
    const help = await runCli(['diff', '--help'], io());
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(/--against/);

    const none = await runCli(['diff'], io());
    expect(none.exitCode).toBe(1);
    expect(none.stderr).toMatch(/diff requires exactly one descriptor file/);

    const two = await runCli(['diff', 'a.json', 'b.json'], io());
    expect(two.exitCode).toBe(1);
    expect(two.stderr).toMatch(/diff requires exactly one descriptor file/);

    const against = await runCli(['diff', 'a.json', '--against', 'local'], io());
    expect(against.exitCode).toBe(1);
    expect(against.stderr).toMatch(/--against local is not supported/);

    const flag = await runCli(['diff', '--nope'], io());
    expect(flag.exitCode).toBe(1);
    expect(flag.stderr).toMatch(/Unknown option/);

    const pin = await runCli(
      ['diff', join(sdkFixtures, 'official/weth-calldata-weth.json'), '--pin', 'main'],
      io()
    );
    expect(pin.exitCode).toBe(1);
    expect(pin.stderr).toMatch(/40-character git commit SHA/);
  });

  it('reports intent, field, and format differences against official', async () => {
    const grouped = wethDescriptor();
    grouped.display.formats['deposit()'] = {
      intent: 'Wrap',
      interpolatedIntent: 'Wrap some ETH',
      fields: [
        {
          label: 'Value',
          fields: [{ path: '@.value', label: 'Wrapped', format: 'amount' }],
        },
      ],
    };
    grouped.display.formats['withdraw(uint256)'] = { intent: 'Unwrap' };
    const groupedFile = await writeDescriptor('grouped.json', grouped);
    const groupedDiff = await runCli(
      ['diff', groupedFile, '--against', 'official', '--pin', PIN],
      io()
    );
    expect(groupedDiff.exitCode).toBe(1);
    expect(groupedDiff.stdout).toMatch(/deposit\(\)\.interpolatedIntent/);
    expect(groupedDiff.stdout).toMatch(/deposit\(\)\.fields/);
    expect(groupedDiff.stdout).toMatch(/\+ withdraw\(uint256\) \(local only\)/);

    const officialOnly = wethDescriptor();
    officialOnly.display.formats = { 'other()': { intent: 'Other', fields: [] } };
    const officialOnlyFile = await writeDescriptor('other.json', officialOnly);
    const removed = await runCli(
      ['diff', officialOnlyFile, '--against', 'official', '--pin', PIN],
      io()
    );
    expect(removed.exitCode).toBe(1);
    expect(removed.stdout).toMatch(/- deposit\(\) \(official only\)/);
    expect(removed.stdout).toMatch(/\+ other\(\) \(local only\)/);
  });

  it('stops when every deployment misses or the deployments disagree', async () => {
    const missed = wethDescriptor();
    missed.context.contract.deployments = [
      { chainId: 1, address: '0x0000000000000000000000000000000000000001' },
    ];
    const missedFile = await writeDescriptor('miss.json', missed);
    const miss = await runCli(['diff', missedFile, '--against', 'official', '--pin', PIN], io());
    expect(miss.exitCode).toBe(1);
    expect(miss.stderr).toMatch(
      /No official descriptor for eip155:1:0x0000000000000000000000000000000000000001/
    );

    const split = wethDescriptor();
    split.context.contract.deployments.push({ chainId: 1, address: STETH });
    const splitFile = await writeDescriptor('split.json', split);
    const many = await runCli(['diff', splitFile, '--against', 'official', '--pin', PIN], io());
    expect(many.exitCode).toBe(1);
    expect(many.stderr).toMatch(/2 distinct official descriptors/);

    const eip712 = await writeDescriptor('eip712.json', {
      $schema: V2_SCHEMA_URI,
      context: {
        eip712: {
          domain: { name: 'WETH', version: '1' },
          deployments: [{ chainId: 1, address: WETH }],
        },
      },
      display: { formats: { 'Permit(address owner)': { intent: 'Permit', fields: [] } } },
    });
    const typed = await runCli(['diff', eip712, '--against', 'official', '--pin', PIN], io());
    expect(typed.exitCode).toBe(1);
    expect(typed.stderr).toMatch(
      /No official descriptor for eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2/
    );
  });
});

describe('erc7730 registry edges', () => {
  it('prints help and rejects an unknown subcommand or a bad pin', async () => {
    const bare = await runCli(['registry'], io());
    expect(bare.exitCode).toBe(1);
    expect(bare.stdout).toMatch(/registry update/);

    const help = await runCli(['registry', '--help'], io());
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(/--cache-dir/);

    const updateHelp = await runCli(['registry', 'update', '--help'], io());
    expect(updateHelp.exitCode).toBe(0);
    expect(updateHelp.stdout).toMatch(/--pin/);

    const unknown = await runCli(['registry', 'compact'], io());
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toMatch(/Unknown registry command: compact/);

    const flag = await runCli(['registry', 'update', '--nope'], io());
    expect(flag.exitCode).toBe(1);
    expect(flag.stderr).toMatch(/Unknown option/);

    const pin = await runCli(['registry', 'update', '--pin', 'main'], io());
    expect(pin.exitCode).toBe(1);
    expect(pin.stderr).toMatch(/40-character git commit SHA/);
  });

  it('reports a failed registry download', async () => {
    const dir = await tempDir();
    const offline = await runCli(['registry', 'update', '--pin', PIN, '--cache-dir', dir], {
      ...io(),
      fetch: async () => {
        throw new Error('offline');
      },
    });
    expect(offline.exitCode).toBe(1);
    expect(offline.stderr).toMatch(/Failed to fetch index.calldata.json: offline/);

    const missing = await runCli(['registry', 'update', '--pin', PIN, '--cache-dir', dir], {
      ...io(),
      fetch: async () => new Response('no', { status: 404 }),
    });
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toMatch(/Failed to fetch index.calldata.json \(404\)/);
  });

  it('follows a relative include and skips paths that are not registry files', async () => {
    const dir = await tempDir();
    const files: Record<string, unknown> = {
      'index.calldata.json': {
        'eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'registry/weth/calldata-weth.json',
        note: 'readme',
        remote: 'https://example.com/a.json',
        abs: '/tmp/a.json',
        parent: '../secret.json',
      },
      'index.eip712.json': {},
      'registry/weth/calldata-weth.json': { includes: '../../ercs/shared.json' },
      'ercs/shared.json': { includes: 1, nested: ['skip.txt', 'registry/weth/calldata-weth.json'] },
    };
    const result = await runCli(['registry', 'update', '--pin', PIN, '--cache-dir', dir], {
      ...io(),
      fetch: mockFetch(files),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/4 file\(s\)/);
    const shared = await readFile(join(dir, 'registry', PIN, 'ercs/shared.json'), 'utf8');
    expect(shared).toMatch(/skip\.txt/);
  });

  it('stops when an include escapes the registry root', async () => {
    const dir = await tempDir();
    const result = await runCli(['registry', 'update', '--pin', PIN, '--cache-dir', dir], {
      ...io(),
      fetch: mockFetch({
        'index.calldata.json': {
          'eip155:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'registry/weth/calldata-weth.json',
        },
        'index.eip712.json': {},
        'registry/weth/calldata-weth.json': { includes: '../../../../outside.json' },
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Include path escapes registry root/);
  });
});

describe('toV2Draft', () => {
  it('maps nft to collection and fills the canonical schema comment', () => {
    const draft = toV2Draft({
      $comment: 1,
      includes: 'shared.json',
      metadata: { owner: 'Example' },
      display: {
        formats: {
          'transfer(address,uint256)': {
            intent: 'Send',
            fields: [
              {
                format: 'addressName',
                params: { types: ['nft', 'wallet', 'wallet', 'nope', 1], extra: 'keep' },
              },
              { format: 'raw', label: 'Data' },
              { label: 'Group', fields: [{ format: 'addressName', params: { types: [] } }] },
              null,
            ],
          },
          'note()': { intent: 'Note' },
          'skip()': null,
        },
      },
    } as unknown as InputDescriptor) as {
      $schema: string;
      $comment: string;
      includes?: string;
      metadata?: { owner: string };
      display: {
        formats: Record<
          string,
          {
            fields?: Array<{
              params?: { types?: string[]; extra?: string };
              format?: string;
              fields?: Array<{ params?: { types?: string[] } }>;
            } | null>;
          } | null
        >;
      };
    };

    expect(draft.$schema).toBe(V2_SCHEMA_URI);
    expect(draft.$comment).toBe(GENERATED_COMMENT);
    expect(draft.includes).toBe('shared.json');
    expect(draft.metadata?.owner).toBe('Example');
    const transfer = draft.display.formats['transfer(address,uint256)'];
    expect(transfer?.fields?.[0]?.params).toEqual({
      types: ['collection', 'wallet'],
      extra: 'keep',
    });
    expect(transfer?.fields?.[1]).toMatchObject({ format: 'raw', label: 'Data' });
    expect(transfer?.fields?.[2]?.fields?.[0]?.params).toEqual({});
    expect(transfer?.fields?.[3]).toBeNull();
    expect(draft.display.formats['note()']).toEqual({ intent: 'Note' });
    expect(draft.display.formats['skip()']).toBeNull();

    const kept = toV2Draft({ $comment: 'kept', display: null } as unknown as InputDescriptor);
    expect(kept.$comment).toBe('kept');
    expect(kept.display).toBeNull();

    const untouched = toV2Draft({
      display: { formats: 'nope' },
    } as unknown as InputDescriptor) as { display: { formats: string } };
    expect(untouched.display.formats).toBe('nope');
  });
});

async function writeTree(root: string, files: Record<string, unknown>): Promise<void> {
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, `${JSON.stringify(body, null, 2)}\n`);
  }
}
