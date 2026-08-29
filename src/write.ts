import { createInterface } from "node:readline/promises";
import {
  assertGitRepo,
  commitStaged,
  getStagedDiff,
  getStagedDiffStats,
} from "./git.js";
import { suggestCommitMessage } from "./llm.js";
import {
  formatCommitMessage,
  renderChangesDetected,
  renderSuggestion,
} from "./format.js";
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

  const suggestion: CommitSuggestion = await suggestCommitMessage(diff, stats);

  console.log(renderChangesDetected(suggestion.changeTypes));
  console.log();
  console.log(renderSuggestion(suggestion));
  console.log();

  const typed = await prompt(
    "Press Enter to accept, or type your own message:\n> ",
  );
  const message = typed === "" ? formatCommitMessage(suggestion) : typed;

  const hash = await commitStaged(cwd, message);
  console.log(`\nCommitted ${hash.slice(0, 7)}: ${message.split("\n")[0]}`);
}
