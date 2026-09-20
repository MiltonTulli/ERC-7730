import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { runDiff } from './diff.js';
import { runGenerate } from './generate.js';
import { ROOT_HELP } from './help.js';
import { runLint } from './lint.js';
import { runPreview } from './preview.js';
import { runRegistry } from './registry.js';
import type { CliIo, CliResult } from './types.js';
import { Output, UsageError } from './types.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

export type { CliIo, CliResult, LintIssue } from './types.js';
export { lintDescriptor } from './lint.js';
export { toV2Draft } from './v2.js';

function defaultIo(io?: Partial<CliIo>): CliIo {
  return {
    cwd: io?.cwd ?? process.cwd(),
    env: io?.env ?? process.env,
    fetch: io?.fetch ?? globalThis.fetch,
    stdin: io?.stdin,
    homedir: io?.homedir ?? homedir(),
    now: io?.now,
  };
}

export async function runCli(argv: string[], io?: Partial<CliIo>): Promise<CliResult> {
  const out = new Output();
  const ctx = { io: defaultIo(io), out };
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '-h' || cmd === '--help') {
    out.println(ROOT_HELP);
    return out.result(cmd ? 0 : 1);
  }
  if (cmd === '-V' || cmd === '--version') {
    out.println(pkg.version);
    return out.result(0);
  }

  try {
    switch (cmd) {
      case 'generate':
        return await runGenerate(rest, ctx);
      case 'lint':
        return await runLint(rest, ctx);
      case 'preview':
        return await runPreview(rest, ctx);
      case 'diff':
        return await runDiff(rest, ctx);
      case 'registry':
        return await runRegistry(rest, ctx);
      default:
        out.eprintln(`Unknown command: ${cmd}`);
        out.eprintln(ROOT_HELP);
        return out.result(1);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      out.eprintln(error.message);
      if (error.help) {
        out.eprintln(error.help);
      }
      return out.result(1);
    }
    const message = error instanceof Error ? error.message : String(error);
    out.eprintln(message);
    return out.result(1);
  }
}
