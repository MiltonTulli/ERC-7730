#!/usr/bin/env node

import { homedir } from 'node:os';
import { runCli } from './run.js';

const result = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  fetch: globalThis.fetch,
  homedir: homedir(),
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
