import {
  DEFAULT_COMMIT_LIMIT,
  assertGitRepo,
  cleanupClone,
  cloneRemote,
  getRecentCommits,
  type CommitRecord,
} from "./git.js";
import { critiqueCommits } from "./llm.js";
import type { CommitCritique } from "./schema.js";
import { renderAnalysis } from "./format.js";
import { createSpinner } from "./ui.js";

/** Score below this lands a commit in "needs work"; at or above, "well-written". */
export const WELL_WRITTEN_THRESHOLD = 6;
/** Score below this counts as a "vague" commit in the stats block. */
export const VAGUE_THRESHOLD = 4;

export interface AnalyzeStats {
  averageScore: number;
  vagueCount: number;
  vaguePercent: number;
  oneWordCount: number;
  oneWordPercent: number;
}

/** A critique joined back to its source commit's metadata. */
export interface EnrichedCritique extends CommitCritique {
  hash?: string;
  author?: string;
  date?: string;
}

export interface ScoreBucket {
  label: string;
  count: number;
}

export interface AnalyzeSummary {
  commits: number;
  averageScore: number;
  grade: string;
  needWork: number;
  wellWritten: number;
  distribution: ScoreBucket[];
}

export interface AnalyzeResult {
  analyzed: number;
  needsWork: EnrichedCritique[];
  wellWritten: EnrichedCritique[];
  stats: AnalyzeStats;
  summary: AnalyzeSummary;
  /** Non-fatal problems (e.g. a critique batch that failed). */
  warnings: string[];
}

/** A subject that is a single bare token: "wip", "updates", "fixed.". */
export function isOneWord(subject: string): boolean {
  const trimmed = subject.trim().replace(/[.!,;:]+$/, "");
  return trimmed.length > 0 && !/\s/.test(trimmed);
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

/** Letter grade for an average score, for the summary line. */
export function gradeFor(average: number): string {
  if (average >= 9) return "A+";
  if (average >= 8) return "A";
  if (average >= 7) return "B";
  if (average >= 6) return "C";
  if (average >= 4) return "D";
  return "F";
}

export function scoreDistribution(critiques: CommitCritique[]): ScoreBucket[] {
  const buckets: ScoreBucket[] = [
    { label: "1-3", count: 0 },
    { label: "4-6", count: 0 },
    { label: "7-10", count: 0 },
  ];
  for (const c of critiques) {
    const idx = c.score <= 3 ? 0 : c.score <= 6 ? 1 : 2;
    const bucket = buckets[idx];
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export function computeStats(
  commits: CommitRecord[],
  critiques: CommitCritique[],
): AnalyzeStats {
  const total = critiques.length;
  const sum = critiques.reduce((acc, c) => acc + c.score, 0);
  const vagueCount = critiques.filter((c) => c.score < VAGUE_THRESHOLD).length;
  const oneWordCount = commits.filter((c) => isOneWord(c.subject)).length;

  return {
    averageScore: total === 0 ? 0 : Number((sum / total).toFixed(1)),
    vagueCount,
    vaguePercent: percent(vagueCount, total),
    oneWordCount,
    oneWordPercent: percent(oneWordCount, commits.length),
  };
}

/** Attach commit metadata to each critique by matching on message / subject. */
export function enrichCritiques(
  commits: CommitRecord[],
  critiques: CommitCritique[],
): EnrichedCritique[] {
  const byMessage = new Map(commits.map((c) => [c.message.trim(), c]));
  const bySubject = new Map(commits.map((c) => [c.subject.trim(), c]));
  return critiques.map((cr) => {
    const key = cr.commit.trim();
    const match = byMessage.get(key) ?? bySubject.get(key);
    return match
      ? { ...cr, hash: match.hash, author: match.author, date: match.date }
      : { ...cr };
  });
}

export interface AnalyzeOptions {
  url?: string;
  cwd?: string;
  limit?: number;
  onProgress?: (completed: number, total: number) => void;
}

export async function analyze(
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const {
    url,
    cwd = process.cwd(),
    limit = DEFAULT_COMMIT_LIMIT,
    onProgress,
  } = options;

  const repoPath = url ? await cloneRemote(url) : cwd;
  try {
    if (!url) await assertGitRepo(repoPath);
    const commits = await getRecentCommits(repoPath, limit);
    if (commits.length === 0) {
      throw new Error("No commits found to analyze.");
    }

    const { critiques, failedBatches } = await critiqueCommits(commits, {
      onProgress,
    });
    if (critiques.length === 0) {
      throw new Error("The LLM returned no usable critiques.");
    }

    const enriched = enrichCritiques(commits, critiques);
    const needsWork = enriched
      .filter((c) => c.score < WELL_WRITTEN_THRESHOLD)
      .sort((a, b) => a.score - b.score);
    const wellWritten = enriched
      .filter((c) => c.score >= WELL_WRITTEN_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const stats = computeStats(commits, critiques);

    const warnings: string[] = [];
    if (failedBatches > 0) {
      warnings.push(
        `${failedBatches} critique ${
          failedBatches === 1 ? "batch" : "batches"
        } failed; ${critiques.length}/${commits.length} commits were scored.`,
      );
    }

    return {
      analyzed: commits.length,
      needsWork,
      wellWritten,
      stats,
      summary: {
        commits: critiques.length,
        averageScore: stats.averageScore,
        grade: gradeFor(stats.averageScore),
        needWork: needsWork.length,
        wellWritten: wellWritten.length,
        distribution: scoreDistribution(critiques),
      },
      warnings,
    };
  } finally {
    if (url) cleanupClone(repoPath);
  }
}

export interface RunAnalyzeOptions extends AnalyzeOptions {
  json?: boolean;
}

export async function runAnalyze(
  options: RunAnalyzeOptions = {},
): Promise<void> {
  const limit = options.limit ?? DEFAULT_COMMIT_LIMIT;
  const spinner = createSpinner();

  if (!options.json) {
    console.log(`Analyzing last ${limit} commits...\n`);
  }
  spinner.start("Reading commits...");

  try {
    const result = await analyze({
      ...options,
      onProgress: (done, total) =>
        spinner.update(`Critiquing commits... ${done}/${total}`),
    });
    spinner.succeed(options.json ? undefined : "Critique complete");

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(renderAnalysis(result));
    for (const w of result.warnings) console.error(`\n! ${w}`);
  } catch (err) {
    spinner.fail();
    throw err;
  }
}
