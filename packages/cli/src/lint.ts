import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type IncludeLoader,
  type InputDescriptor,
  type ValidationIssue,
  resolveDescriptor,
  validateDescriptor,
  validateDescriptorTests,
} from '@erc7730/sdk';
import {
  asInputDescriptor,
  collectJsonFiles,
  createFsIncludeLoader,
  pathExists,
  readJsonFile,
  resolvePath,
} from './fsjson';
import { LINT_HELP } from './help';
import type { CliContext, CliResult, LintIssue } from './types';
import { UsageError } from './types';

function schemaIssues(errors: ValidationIssue[]): LintIssue[] {
  return errors.map((error) => ({
    level: 'error',
    path: error.path,
    message: error.message,
    rule: error.rule ?? 'schema',
  }));
}

function walkFormats(descriptor: InputDescriptor, issues: LintIssue[]): void {
  const display = descriptor.display;
  if (!display || typeof display !== 'object') {
    issues.push({
      level: 'warning',
      path: '/display',
      message: 'Descriptor has no display section',
      rule: 'missing_display',
    });
    return;
  }
  const formats = (display as { formats?: unknown }).formats;
  if (!formats || typeof formats !== 'object') {
    issues.push({
      level: 'warning',
      path: '/display/formats',
      message: 'Descriptor has no display.formats',
      rule: 'missing_formats',
    });
    return;
  }
  const entries = Object.entries(formats as Record<string, unknown>);
  if (entries.length === 0) {
    issues.push({
      level: 'warning',
      path: '/display/formats',
      message: 'display.formats is empty',
      rule: 'empty_formats',
    });
    return;
  }
  for (const [key, format] of entries) {
    const pointer = `/display/formats/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (!format || typeof format !== 'object') {
      continue;
    }
    const rec = format as Record<string, unknown>;
    if (rec.intent === undefined) {
      issues.push({
        level: 'warning',
        path: `${pointer}/intent`,
        message: 'Format is missing intent — authors should replace the generated default',
        rule: 'missing_intent',
      });
    }
    if (!Array.isArray(rec.fields) || rec.fields.length === 0) {
      issues.push({
        level: 'warning',
        path: `${pointer}/fields`,
        message: 'Format has no fields',
        rule: 'missing_fields',
      });
    }
  }
}

export interface DescriptorLint {
  issues: LintIssue[];
  /** Present when the file has no error-level issues. */
  summary?: string;
}

function countFormats(descriptor: InputDescriptor): number {
  const display = descriptor.display;
  if (!display || typeof display !== 'object') {
    return 0;
  }
  const formats = (display as { formats?: unknown }).formats;
  if (!formats || typeof formats !== 'object' || Array.isArray(formats)) {
    return 0;
  }
  return Object.keys(formats).length;
}

function schemaSummary(version: '1' | '2', formats: number, includes: number): string {
  const noun = formats === 1 ? 'format' : 'formats';
  return `schema erc7730-v${version} · ${formats} ${noun} · includes: ${includes} resolved`;
}

function countingLoader(loader: IncludeLoader, count: { resolved: number }): IncludeLoader {
  return {
    async load(ref, from) {
      const loaded = await loader.load(ref, from);
      count.resolved += 1;
      return loaded;
    },
  };
}

export async function lintDescriptor(
  input: unknown,
  options?: { fromPath?: string }
): Promise<DescriptorLint> {
  const issues: LintIssue[] = [];
  const validated = validateDescriptor(input);
  if (!validated.ok) {
    return { issues: schemaIssues(validated.errors) };
  }

  const descriptor = validated.descriptor;
  let toWalk = descriptor;
  const includes = { resolved: 0 };
  if (typeof descriptor.includes === 'string' && options?.fromPath) {
    try {
      const resolved = await resolveDescriptor(
        descriptor,
        countingLoader(createFsIncludeLoader(options.fromPath), includes)
      );
      toWalk = resolved.merged;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({
        level: 'error',
        path: '/includes',
        message,
        rule: 'unresolved_include',
      });
    }
  }

  walkFormats(toWalk, issues);
  if (issues.some((issue) => issue.level === 'error')) {
    return { issues };
  }
  return {
    issues,
    summary: schemaSummary(validated.version, countFormats(toWalk), includes.resolved),
  };
}

function missingContextAndDisplay(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return true;
  }
  const record = value as Record<string, unknown>;
  return record.context === undefined && record.display === undefined;
}

function formatIssues(
  file: string,
  issues: LintIssue[],
  options?: { summary?: string; unlike?: boolean }
): string[] {
  const lines: string[] = [];
  const errors = issues.filter((issue) => issue.level === 'error').length;
  const warnings = issues.filter((issue) => issue.level === 'warning').length;
  const notes = issues.filter((issue) => issue.level === 'note').length;
  if (options?.unlike && errors > 0) {
    lines.push('this does not look like an ERC-7730 descriptor');
  }
  lines.push(`${file}: ${errors} error(s), ${warnings} warning(s), ${notes} note(s)`);
  for (const issue of issues) {
    lines.push(`  ${issue.level.padEnd(7)} ${issue.path}  ${issue.message}  [${issue.rule}]`);
  }
  if (options?.summary && errors === 0) {
    lines.push(options.summary);
  }
  return lines;
}

export async function runLint(args: string[], ctx: CliContext): Promise<CliResult> {
  let values: { help?: boolean; json?: boolean; tests?: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        json: { type: 'boolean' },
        tests: { type: 'boolean' },
      },
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), LINT_HELP);
  }

  if (values.help) {
    ctx.out.println(LINT_HELP);
    return ctx.out.result(0);
  }
  if (positionals.length === 0) {
    throw new UsageError('lint requires a file or directory path', LINT_HELP);
  }

  const reports: Array<{
    file: string;
    issues: LintIssue[];
    summary?: string;
    unlike?: boolean;
  }> = [];
  let hadError = false;

  for (const raw of positionals) {
    const target = resolvePath(ctx.io.cwd, raw);
    let files: string[];
    try {
      if (!(await pathExists(target))) {
        reports.push({
          file: raw,
          issues: [
            {
              level: 'error',
              path: '/',
              message: `File not found: ${target}`,
              rule: 'io',
            },
          ],
        });
        hadError = true;
        continue;
      }
      files = await collectJsonFiles(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reports.push({
        file: raw,
        issues: [{ level: 'error', path: '/', message, rule: 'io' }],
      });
      hadError = true;
      continue;
    }
    if (files.length === 0) {
      reports.push({
        file: raw,
        issues: [
          {
            level: 'error',
            path: '/',
            message: 'No JSON files found',
            rule: 'io',
          },
        ],
      });
      hadError = true;
      continue;
    }

    for (const file of files) {
      const label = relative(ctx.io.cwd, file) || file;
      let json: unknown;
      try {
        json = await readJsonFile(file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reports.push({
          file: label,
          issues: [{ level: 'error', path: '/', message, rule: 'json' }],
        });
        hadError = true;
        continue;
      }

      if (values.tests) {
        const validated = validateDescriptorTests(json);
        const issues = validated.ok ? [] : schemaIssues(validated.errors);
        if (issues.some((issue) => issue.level === 'error')) {
          hadError = true;
        }
        reports.push({ file: label, issues });
        continue;
      }

      let descriptor: ReturnType<typeof asInputDescriptor>;
      try {
        descriptor = asInputDescriptor(json, label);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reports.push({
          file: label,
          unlike: missingContextAndDisplay(json),
          issues: [{ level: 'error', path: '/', message, rule: 'json' }],
        });
        hadError = true;
        continue;
      }
      const linted = await lintDescriptor(descriptor, { fromPath: file });
      if (linted.issues.some((issue) => issue.level === 'error')) {
        hadError = true;
      }
      reports.push({
        file: label,
        issues: linted.issues,
        summary: linted.summary,
        unlike: missingContextAndDisplay(json),
      });
    }
  }

  if (values.json) {
    ctx.out.writeOut(`${JSON.stringify(reports, null, 2)}\n`);
  } else {
    for (const report of reports) {
      for (const line of formatIssues(report.file, report.issues, {
        summary: report.summary,
        unlike: report.unlike,
      })) {
        ctx.out.println(line);
      }
    }
  }

  return ctx.out.result(hadError ? 1 : 0);
}
