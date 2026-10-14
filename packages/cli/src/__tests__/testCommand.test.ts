import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, serializeTransaction } from 'viem';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../run';

const here = dirname(fileURLToPath(import.meta.url));
const wethDescriptor = join(here, '../../../registry/descriptors/weth/calldata-weth.json');
const wethTests = join(here, '../../../registry/descriptors/weth/testsv2/calldata-weth.tests.json');
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const TREASURY = '0x1111111111111111111111111111111111111111';
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'erc7730-test-'));
  dirs.push(dir);
  return dir;
}

function io(overrides?: { env?: NodeJS.ProcessEnv; cwd?: string }) {
  return {
    cwd: overrides?.cwd ?? here,
    env: overrides?.env ?? {},
    fetch: (async () => new Response('not found', { status: 404 })) as typeof fetch,
    homedir: tmpdir(),
  };
}

describe('erc7730 test', () => {
  it('renders the WETH wrap screen and matches the official expected output', async () => {
    const result = await runCli(['test', wethDescriptor, '--tests', wethTests], io());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Wrap - chain 1');
    expect(result.stdout).toContain('Unverified: Wrap');
    expect(result.stdout).toContain('Amount: 0.00187 ETH');
    expect(result.stdout).toContain('1 passed, 0 failed');
    expect(result.stdout).not.toContain('--- expected');
  });

  it('finds testsv2/<name>.tests.json next to the descriptor', async () => {
    const result = await runCli(['test', wethDescriptor], io());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Amount: 0.00187 ETH');
  });

  it('prints a diff and exits 1 when expected does not match', async () => {
    const dir = await tempDir();
    const testsPath = join(dir, 'calldata-weth.tests.json');
    const document = JSON.parse(await readFile(wethTests, 'utf8')) as {
      tests: Array<{ expected: { intent: string } }>;
    };
    document.tests[0].expected.intent = 'Deposit';
    await writeFile(testsPath, JSON.stringify(document));

    const result = await runCli(['test', wethDescriptor, '--tests', testsPath], io());

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('intent mismatch');
    expect(result.stdout).toContain('--- expected');
    expect(result.stdout).toContain('-  "intent": "Deposit"');
    expect(result.stdout).toContain('+  "intent": "Wrap"');
    expect(result.stdout).toContain('Unverified: Wrap');
    expect(result.stdout).toContain('0 passed, 1 failed');
  });

  it('writes GitHub annotations and a summary that contains the screen', async () => {
    const dir = await tempDir();
    const summary = join(dir, 'summary.md');
    const pass = await runCli(
      ['test', wethDescriptor, '--tests', wethTests, '--reporter', 'github'],
      io({ env: { GITHUB_STEP_SUMMARY: summary } })
    );

    expect(pass.exitCode).toBe(0);
    expect(pass.stdout).not.toContain('::error');
    const summaryText = await readFile(summary, 'utf8');
    expect(summaryText).toContain('## erc7730 test');
    expect(summaryText).toContain('Unverified: Wrap');
    expect(summaryText).toContain('Amount: 0.00187 ETH');

    const testsPath = join(dir, 'mismatch.tests.json');
    const document = JSON.parse(await readFile(wethTests, 'utf8')) as {
      tests: Array<{ expected: { intent: string } }>;
    };
    document.tests[0].expected.intent = 'Deposit';
    await writeFile(testsPath, JSON.stringify(document));
    const fail = await runCli(
      ['test', wethDescriptor, '--tests', testsPath, '--reporter', 'github'],
      io()
    );
    expect(fail.exitCode).toBe(1);
    expect(fail.stdout).toContain(`::error file=${testsPath},line=`);
    expect(fail.stdout).toContain('Wrap - chain 1: intent mismatch');
    expect(fail.stdout).toContain('```text');
    expect(fail.stdout).toContain('Amount: 0.00187 ETH');
  });

  it('reports a truncated official raw transaction as a case error', async () => {
    const dir = await tempDir();
    const testsPath = join(dir, 'truncated.tests.json');
    await writeFile(
      testsPath,
      JSON.stringify({
        descriptor: '../calldata-weth.json',
        tests: [
          {
            description: 'Truncated wrap',
            rawTx:
              '0x02f5018202098477359400848c45e4d782798994c02aaa39b223fe8d0a0e5c4f27ead9083c756cc28706a4c14dbae00085d0e30db076c0',
            expected: { intent: 'Wrap', fields: [] },
          },
        ],
      })
    );

    const result = await runCli(['test', wethDescriptor, '--tests', testsPath], io());
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Truncated wrap');
    expect(result.stdout).toContain('Truncated calldata');
    expect(result.stdout).toContain('error');
  });

  it('rejects a testsv2 file that fails the schema', async () => {
    const dir = await tempDir();
    const testsPath = join(dir, 'empty.tests.json');
    await writeFile(testsPath, JSON.stringify({ descriptor: '../x.json', tests: [] }));
    const result = await runCli(['test', wethDescriptor, '--tests', testsPath], io());
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('invalid testsv2 file');
  });

  it('runs an EIP-712 case and a calldata case that uses dataProvider', async () => {
    const dir = await tempDir();
    const permitPath = join(dir, 'eip712-permit.json');
    const permitTests = join(dir, 'testsv2', 'eip712-permit.tests.json');
    await mkdir(dirname(permitTests), { recursive: true });
    await writeFile(
      permitPath,
      JSON.stringify({
        $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
        context: {
          eip712: {
            domain: { name: 'DomainOnlyPermit', version: '1', chainId: 1 },
          },
        },
        metadata: { owner: 'Example' },
        display: {
          formats: {
            'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)': {
              intent: 'Permit',
              fields: [
                { path: 'spender', label: 'Spender', format: 'raw' },
                { path: 'value', label: 'Value', format: 'raw' },
              ],
            },
          },
        },
      })
    );
    await writeFile(
      permitTests,
      JSON.stringify({
        descriptor: '../eip712-permit.json',
        tests: [
          {
            description: 'Permit 1 token',
            data: {
              types: {
                EIP712Domain: [
                  { name: 'name', type: 'string' },
                  { name: 'version', type: 'string' },
                  { name: 'chainId', type: 'uint256' },
                  { name: 'verifyingContract', type: 'address' },
                ],
                Permit: [
                  { name: 'owner', type: 'address' },
                  { name: 'spender', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'deadline', type: 'uint256' },
                ],
              },
              primaryType: 'Permit',
              domain: {
                name: 'DomainOnlyPermit',
                version: '1',
                chainId: 1,
                verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
              },
              message: {
                owner: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
                spender: TREASURY,
                value: '1',
                nonce: '0',
                deadline: '2000000000',
              },
            },
            expected: {
              intent: 'Permit',
              owner: 'Example',
              fields: [
                { label: 'Spender', value: TREASURY },
                { label: 'Value', value: '1' },
              ],
            },
          },
        ],
      })
    );

    const permit = await runCli(['test', permitPath], io());
    expect(permit.exitCode, permit.stdout + permit.stderr).toBe(0);
    expect(permit.stdout).toContain('Permit 1 token');
    expect(permit.stdout).toContain(`Spender: ${TREASURY}`);

    const approvePath = join(dir, 'calldata-usdc.json');
    const data = encodeFunctionData({
      abi: [
        {
          type: 'function',
          name: 'approve',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
      ],
      functionName: 'approve',
      args: [TREASURY, 100_000_000n],
    });
    const rawTx = serializeTransaction({
      type: 'eip1559',
      chainId: 1,
      nonce: 0,
      gas: 50_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      to: USDC,
      value: 0n,
      data,
    });
    await writeFile(
      approvePath,
      JSON.stringify({
        $schema: 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',
        context: {
          contract: { deployments: [{ chainId: 1, address: USDC }] },
        },
        metadata: { owner: 'USD Coin' },
        display: {
          formats: {
            'approve(address spender,uint256 amount)': {
              intent: 'Approve',
              interpolatedIntent: 'Allow {spender} to spend {amount}',
              fields: [
                {
                  path: '#.spender',
                  label: 'Spender',
                  format: 'addressName',
                  params: { sources: ['local'] },
                },
                {
                  path: '#.amount',
                  label: 'Amount',
                  format: 'tokenAmount',
                  params: { tokenPath: '@.to' },
                },
              ],
            },
          },
        },
      })
    );
    await writeFile(
      join(dir, 'usdc.tests.json'),
      JSON.stringify({
        descriptor: '../calldata-usdc.json',
        dataProvider: {
          tokens: {
            [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6, name: 'USD Coin' },
          },
          addressNames: { [TREASURY.toLowerCase()]: 'Treasury' },
        },
        tests: [
          {
            description: 'Approve 100 USDC for Treasury',
            rawTx,
            expected: {
              intent: 'Approve',
              interpolatedIntent: 'Allow Treasury to spend 100 USDC',
              owner: 'USD Coin',
              fields: [
                { label: 'Spender', value: 'Treasury' },
                { label: 'Amount', value: '100 USDC' },
              ],
            },
          },
        ],
      })
    );

    const approve = await runCli(
      ['test', approvePath, '--tests', join(dir, 'usdc.tests.json')],
      io()
    );
    expect(approve.exitCode, approve.stdout + approve.stderr).toBe(0);
    expect(approve.stdout).toContain('Spender: Treasury');
    expect(approve.stdout).toContain('Amount: 100 USDC');
    expect(approve.stdout).toContain('Allow Treasury to spend 100 USDC');
    expect(approve.stdout).not.toContain('intent mismatch');
  });

  it('annotates the description line when that text also appears as an intent', async () => {
    const dir = await tempDir();
    const document = JSON.parse(await readFile(wethTests, 'utf8')) as {
      tests: Array<{ description: string; expected: { intent: string } }>;
    };
    const passing = document.tests[0];
    if (!passing) {
      throw new Error('WETH fixture has no case');
    }
    document.tests.push({
      ...passing,
      description: 'Wrap',
      expected: { ...passing.expected, intent: 'Deposit' },
    });
    const testsPath = join(dir, 'wrapped.tests.json');
    const text = `${JSON.stringify(document, null, 2)}\n`;
    await writeFile(testsPath, text);
    const descriptionLine =
      text.split('\n').findIndex((line) => line.includes('"description": "Wrap"')) + 1;

    const result = await runCli(
      ['test', wethDescriptor, '--tests', testsPath, '--reporter', 'github'],
      io()
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`::error file=${testsPath},line=${descriptionLine}::`);
    expect(result.stdout).toContain('Wrap: intent mismatch');
  });
});
