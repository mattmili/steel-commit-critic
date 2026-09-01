import { createInterface } from "node:readline/promises";
import {
  assertGitRepo,
  commitStaged,
  getStagedDiff,
  getStagedDiffStats,
  type StagedDiffStats,
} from "./git.js";
import { suggestCommitMessage } from "./llm.js";
import {
  formatCommitMessage,
  renderChangesDetected,
  renderSuggestion,
} from "./format.js";
import { createSpinner } from "./ui.js";
import type { CommitSuggestion } from "./schema.js";

export interface WriteOptions {
  cwd?: string;
  /** Injectable for tests: resolve the line the user typed at the `>` prompt. */
  prompt?: (question: string) => Promise<string>;
}

async function defaultPrompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Per-file `+/-` sparkline, scaled to the largest file in the change set. */
function fileSparklines(stats: StagedDiffStats): string {
  const max = Math.max(1, ...stats.files.map((f) => f.changes));
  return stats.files
    .slice(0, 10)
    .map((f) => {
      const width = Math.max(1, Math.round((f.changes / max) * 12));
      return `  ${f.file}  ${"▍".repeat(width)} ${f.changes}`;
    })
    .join("\n");
}

async function draftMessage(
  cwd: string,
  diff: string,
  stats: StagedDiffStats,
): Promise<CommitSuggestion> {
  const spinner = createSpinner();
  spinner.start("Drafting a commit message...");
  try {
    const suggestion = await suggestCommitMessage(diff, stats);
    spinner.succeed("Draft ready");
    return suggestion;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export async function runWrite(options: WriteOptions = {}): Promise<void> {
  const { cwd = process.cwd(), prompt = defaultPrompt } = options;

  await assertGitRepo(cwd);

  const [diff, stats] = await Promise.all([
    getStagedDiff(cwd),
    getStagedDiffStats(cwd),
  ]);

  if (stats.filesChanged === 0 || diff.trim() === "") {
    throw new Error(
      "No staged changes. Stage files with `git add` before running --write.",
    );
  }

  console.log(
    `Analyzing staged changes... (${stats.filesChanged} files changed, ` +
      `+${stats.insertions} -${stats.deletions} lines)\n`,
  );
  console.log(fileSparklines(stats));
  console.log();

  let suggestion = await draftMessage(cwd, diff, stats);

  // Loop so the user can regenerate before committing.
  for (;;) {
    console.log(renderChangesDetected(suggestion.changeTypes));
    console.log();
    console.log(renderSuggestion(suggestion));
    console.log();

    const typed = await prompt(
      "Press Enter to accept, type your own message, or 'r' to regenerate:\n> ",
    );

    if (typed.toLowerCase() === "r") {
      suggestion = await draftMessage(cwd, diff, stats);
      continue;
    }

    const message = typed === "" ? formatCommitMessage(suggestion) : typed;
    const hash = await commitStaged(cwd, message);
    console.log(`\nCommitted ${hash.slice(0, 7)}: ${message.split("\n")[0]}`);
    return;
  }
}
