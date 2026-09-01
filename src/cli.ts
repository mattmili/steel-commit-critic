#!/usr/bin/env node
import { Command } from "commander";

export interface CliOptions {
  analyze?: boolean;
  write?: boolean;
  url?: string;
  json?: boolean;
  limit?: number;
}

export type Mode =
  | { kind: "analyze"; url?: string; json: boolean; limit?: number }
  | { kind: "write" };

/** Parse and validate the --limit value. */
export function parseLimit(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--limit must be a positive integer, got "${raw}".`);
  }
  return n;
}

/**
 * Resolve the mutually-exclusive run mode from parsed flags.
 * Throws a user-facing error when the flags don't select exactly one mode.
 */
export function resolveMode(opts: CliOptions): Mode {
  if (opts.analyze && opts.write) {
    throw new Error("Choose one of --analyze or --write, not both.");
  }
  if (opts.write) {
    return { kind: "write" };
  }
  if (opts.analyze) {
    return {
      kind: "analyze",
      url: opts.url,
      json: opts.json ?? false,
      limit: opts.limit,
    };
  }
  throw new Error("Nothing to do. Pass --analyze [--url=<repo-url>] or --write.");
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("commit-critic")
    .description(
      "AI-powered CLI that critiques commit message quality and drafts conventional-commit messages.",
    )
    .option("--analyze", "critique recent commits and print a report")
    .option(
      "--url <url>",
      "analyze a remote repo (shallow-cloned) instead of the current one",
    )
    .option(
      "--write",
      "suggest a conventional-commit message for the staged diff",
    )
    .option("--json", "with --analyze, print the raw structured result as JSON")
    .option(
      "--limit <n>",
      "with --analyze, number of commits to review (default 50)",
      parseLimit,
    );
  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  program.parse(argv);
  const opts = program.opts<CliOptions>();

  const mode = resolveMode(opts);

  if (mode.kind === "analyze") {
    const { runAnalyze } = await import("./analyze.js");
    await runAnalyze({ url: mode.url, json: mode.json, limit: mode.limit });
    return;
  }

  const { runWrite } = await import("./write.js");
  await runWrite();
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  run(process.argv).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
  });
}
