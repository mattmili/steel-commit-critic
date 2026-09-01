import chalk from "chalk";
import type { AnalyzeResult, EnrichedCritique, ScoreBucket } from "./analyze.js";
import type { CommitSuggestion } from "./schema.js";

const RULE = "━".repeat(28);
const COMMIT_INDENT = " ".repeat(9); // aligns under the opening quote of `Commit: "`
const BAR_WIDTH = 20;

/** red for weak, yellow for middling, green for strong. */
function tint(score: number): (s: string) => string {
  if (score < 4) return chalk.red;
  if (score <= 7) return chalk.yellow;
  return chalk.green;
}

export function colorScore(score: number): string {
  return tint(score)(`${score}/10`);
}

/** A 10-cell bar, filled to `score`, coloured by the same thresholds. */
export function scoreBar(score: number): string {
  const filled = Math.max(0, Math.min(10, score));
  return tint(score)("▰".repeat(filled) + "▱".repeat(10 - filled));
}

/** "3 days ago" style age from an ISO date. */
export function relativeDate(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((now.getTime() - then) / 1000);
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = Math.max(secs, 0);
  for (const [size, name] of units) {
    if (value < size) {
      const rounded = Math.round(value);
      return `${rounded} ${name}${rounded === 1 ? "" : "s"} ago`;
    }
    value /= size;
  }
  return "just now";
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

function metaLine(c: EnrichedCritique): string | undefined {
  if (!c.hash) return undefined;
  const parts = [c.hash.slice(0, 7)];
  if (c.author) parts.push(c.author);
  if (c.date) {
    const age = relativeDate(c.date);
    if (age) parts.push(age);
  }
  return `${COMMIT_INDENT}${chalk.dim(parts.join(" · "))}`;
}

function scoreLine(score: number): string {
  return `Score: ${colorScore(score)}  ${chalk.dim(scoreBar(score))}`;
}

function needsWorkEntry(c: EnrichedCritique): string {
  return [
    `Commit: ${quoteCommit(c.commit)}`,
    metaLine(c),
    scoreLine(c.score),
    `Issue: ${c.issue}`,
    `Better: "${c.better}"`,
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function wellWrittenEntry(c: EnrichedCritique): string {
  return [
    `Commit: ${quoteCommit(c.commit)}`,
    metaLine(c),
    scoreLine(c.score),
    `Why it's good: ${c.whyItsGood}`,
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export function renderSummaryLine(result: AnalyzeResult): string {
  const { summary } = result;
  const bits = [
    `${summary.commits} commits`,
    `avg ${summary.averageScore.toFixed(1)}/10`,
    `grade ${summary.grade}`,
    `${summary.needWork} need work`,
    `${summary.wellWritten} solid`,
  ];
  return chalk.bold(bits.join(chalk.dim("  ·  ")));
}

function renderHistogram(distribution: ScoreBucket[]): string {
  const max = Math.max(1, ...distribution.map((b) => b.count));
  const rows = distribution.map((b) => {
    const width = Math.round((b.count / max) * BAR_WIDTH);
    const label = b.label.padEnd(4);
    return `  ${label} ${"█".repeat(width)} ${b.count}`;
  });
  return ["Score spread:", ...rows].join("\n");
}

export function renderAnalysis(result: AnalyzeResult): string {
  const { needsWork, wellWritten, stats, summary } = result;
  const out: string[] = [];

  out.push(renderSummaryLine(result));
  out.push("");

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
      renderHistogram(summary.distribution),
      "",
    ].join("\n"),
  );

  return out.join("\n");
}

const TYPE_TINT: Record<string, (s: string) => string> = {
  feat: chalk.green,
  fix: chalk.red,
  perf: chalk.magenta,
  refactor: chalk.blue,
  docs: chalk.cyan,
  test: chalk.yellow,
};

/** Render the boxed conventional-commit message for --write. */
export function formatCommitMessage(s: CommitSuggestion): string {
  const header = s.scope
    ? `${s.type}(${s.scope}): ${s.summary}`
    : `${s.type}: ${s.summary}`;
  const body = s.body.map((line) => `- ${line}`).join("\n");
  return body ? `${header}\n\n${body}` : header;
}

export function renderSuggestion(s: CommitSuggestion): string {
  const tintType = TYPE_TINT[s.type] ?? chalk.white;
  const scope = s.scope ? `(${s.scope})` : "";
  const coloredHeader = `${tintType(s.type)}${scope}: ${chalk.bold(s.summary)}`;
  const body = s.body.map((line) => `- ${line}`).join("\n");
  return [
    "Suggested commit message:",
    RULE,
    body ? `${coloredHeader}\n\n${body}` : coloredHeader,
    RULE,
  ].join("\n");
}

export function renderChangesDetected(changeTypes: string[]): string {
  return ["Changes detected:", ...changeTypes.map((c) => `- ${c}`)].join("\n");
}
