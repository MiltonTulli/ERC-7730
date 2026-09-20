export interface CliIo {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  stdin?: string;
  homedir: string;
  now?: () => number;
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class UsageError extends Error {
  readonly help?: string;

  constructor(message: string, help?: string) {
    super(message);
    this.name = 'UsageError';
    this.help = help;
  }
}

export class Output {
  stdout = '';
  stderr = '';

  println(line = ''): void {
    this.stdout += `${line}\n`;
  }

  eprintln(line = ''): void {
    this.stderr += `${line}\n`;
  }

  writeOut(text: string): void {
    this.stdout += text;
  }

  result(exitCode: number): CliResult {
    return { exitCode, stdout: this.stdout, stderr: this.stderr };
  }
}

export interface CliContext {
  io: CliIo;
  out: Output;
}

export interface LintIssue {
  level: 'error' | 'warning' | 'note';
  path: string;
  message: string;
  rule: string;
}

export const V2_SCHEMA_URI = 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json';

export const GENERATED_COMMENT =
  'Generated draft. Review intents and formats before submitting to the official registry. Never a high-confidence runtime source.';

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const HEX_RE = /^0x[0-9a-fA-F]*$/;
export const PIN_RE = /^[0-9a-f]{40}$/i;
