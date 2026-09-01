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

export interface AnalyzeResult {
  analyzed: number;
  needsWork: CommitCritique[];
  wellWritten: CommitCritique[];
  stats: AnalyzeStats;
}

/** A subject that is a single bare token: "wip", "updates", "fixed.". */
export function isOneWord(subject: string): boolean {
  const trimmed = subject.trim().replace(/[.!,;:]+$/, "");
  return trimmed.length > 0 && !/\s/.test(trimmed);
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
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

export interface AnalyzeOptions {
  url?: string;
  cwd?: string;
  limit?: number;
}

export async function analyze(
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const { url, cwd = process.cwd(), limit = DEFAULT_COMMIT_LIMIT } = options;

  const repoPath = url ? await cloneRemote(url) : cwd;
  try {
    if (!url) await assertGitRepo(repoPath);
    const commits = await getRecentCommits(repoPath, limit);
    if (commits.length === 0) {
      throw new Error("No commits found to analyze.");
    }

    const critiques = await critiqueCommits(commits);
    const needsWork = critiques
      .filter((c) => c.score < WELL_WRITTEN_THRESHOLD)
      .sort((a, b) => a.score - b.score);
    const wellWritten = critiques
      .filter((c) => c.score >= WELL_WRITTEN_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    return {
      analyzed: commits.length,
      needsWork,
      wellWritten,
      stats: computeStats(commits, critiques),
    };
  } finally {
    if (url) cleanupClone(repoPath);
  }
}

export async function runAnalyze(
  options: AnalyzeOptions = {},
): Promise<void> {
  const limit = options.limit ?? DEFAULT_COMMIT_LIMIT;
  console.log(`Analyzing last ${limit} commits...\n`);
  const result = await analyze(options);
  process.stdout.write(renderAnalysis(result));
}
