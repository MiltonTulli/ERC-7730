#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { runCli } from './run.js';

const argv = process.argv.slice(2);

function wantsAbiStdin(args: readonly string[]): boolean {
  if (args[0] !== 'generate') {
    return false;
  }
  if (args.includes('--help') || args.includes('-h')) {
    return false;
  }
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--abi=-' || (arg === '--abi' && args[i + 1] === '-')) {
      return true;
    }
  }
  return false;
}

const result = await runCli(argv, {
  cwd: process.cwd(),
  env: process.env,
  fetch: globalThis.fetch,
  homedir: homedir(),
  stdin: wantsAbiStdin(argv) ? readFileSync(0, 'utf8') : undefined,
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
