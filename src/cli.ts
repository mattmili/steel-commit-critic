import { Command } from "commander";

export interface CliOptions {
  analyze?: boolean;
  write?: boolean;
  url?: string;
}

export type Mode =
  | { kind: "analyze"; url?: string }
  | { kind: "write" };

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
    return { kind: "analyze", url: opts.url };
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
    .option("--analyze", "critique the last 50 commits and print a report")
    .option(
      "--url <url>",
      "analyze a remote repo (shallow-cloned) instead of the current one",
    )
    .option(
      "--write",
      "suggest a conventional-commit message for the staged diff",
    );
  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  program.parse(argv);
  const opts = program.opts<CliOptions>();

  const mode = resolveMode(opts);

  // Wired to the real orchestrators in later steps; for now, report the mode.
  if (mode.kind === "analyze") {
    console.log(
      `mode: analyze${mode.url ? ` (remote: ${mode.url})` : " (current repo)"}`,
    );
    return;
  }
  console.log("mode: write");
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
