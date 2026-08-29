import chalk from "chalk";
import type { AnalyzeResult } from "./analyze.js";
import type { CommitCritique, CommitSuggestion } from "./schema.js";

const RULE = "━".repeat(28);
const COMMIT_INDENT = " ".repeat(9); // aligns under the opening quote of `Commit: "`

/** red for weak, yellow for middling, green for strong. */
export function colorScore(score: number): string {
  const label = `${score}/10`;
  if (score < 4) return chalk.red(label);
  if (score <= 7) return chalk.yellow(label);
  return chalk.green(label);
}

function section(title: string): string {
  return `${RULE}\n${title}\n${RULE}`;
}

/** Quote a possibly multi-line commit message, indenting continuation lines. */
function quoteCommit(message: string): string {
  const [first, ...rest] = message.split("\n");
  const continued = rest.map((line) =>
    line.trim() === "" ? "" : `${COMMIT_INDENT}${line}`,
  );
  return `"${[first, ...continued].join("\n")}"`;
}

function needsWorkEntry(c: CommitCritique): string {
  return [
    `Commit: ${quoteCommit(c.commit)}`,
    `Score: ${colorScore(c.score)}`,
    `Issue: ${c.issue}`,
    `Better: "${c.better}"`,
    "",
  ].join("\n");
}

function wellWrittenEntry(c: CommitCritique): string {
  return [
    `Commit: ${quoteCommit(c.commit)}`,
    `Score: ${colorScore(c.score)}`,
    `Why it's good: ${c.whyItsGood}`,
    "",
  ].join("\n");
}

export function renderAnalysis(result: AnalyzeResult): string {
  const { needsWork, wellWritten, stats } = result;
  const out: string[] = [];

  out.push(section("💩 COMMITS THAT NEED WORK"));
  out.push("");
  out.push(
    needsWork.length > 0
      ? needsWork.map(needsWorkEntry).join("\n")
      : "None — every commit cleared the bar.\n",
  );

  out.push(section("💎 WELL-WRITTEN COMMITS"));
  out.push("");
  out.push(
    wellWritten.length > 0
      ? wellWritten.map(wellWrittenEntry).join("\n")
      : "None — nothing scored well enough.\n",
  );

  out.push(section("📊 YOUR STATS"));
  out.push(
    [
      `Average score: ${stats.averageScore.toFixed(1)}/10`,
      `Vague commits: ${stats.vagueCount} (${stats.vaguePercent}%)`,
      `One-word commits: ${stats.oneWordCount} (${stats.oneWordPercent}%)`,
      "",
    ].join("\n"),
  );

  return out.join("\n");
}

/** Render the boxed conventional-commit message for --write. */
export function formatCommitMessage(s: CommitSuggestion): string {
  const header = s.scope
    ? `${s.type}(${s.scope}): ${s.summary}`
    : `${s.type}: ${s.summary}`;
  const body = s.body.map((line) => `- ${line}`).join("\n");
  return body ? `${header}\n\n${body}` : header;
}

export function renderSuggestion(s: CommitSuggestion): string {
  return [
    "Suggested commit message:",
    RULE,
    formatCommitMessage(s),
    RULE,
  ].join("\n");
}

export function renderChangesDetected(changeTypes: string[]): string {
  return ["Changes detected:", ...changeTypes.map((c) => `- ${c}`)].join("\n");
}
