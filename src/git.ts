import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

export interface CommitRecord {
  hash: string;
  /** First line of the commit message. */
  subject: string;
  /** Full message: subject plus body when present. */
  message: string;
  author: string;
  date: string;
}

export const DEFAULT_COMMIT_LIMIT = 50;

/** Clone depth for remote analysis: a little deeper than the commit limit. */
export const CLONE_DEPTH = 60;

function git(repoPath: string): SimpleGit {
  return simpleGit({ baseDir: repoPath });
}

/** Throw a friendly error when `repoPath` is not inside a git repo. */
export async function assertGitRepo(repoPath: string): Promise<void> {
  let isRepo = false;
  try {
    isRepo = await git(repoPath).checkIsRepo();
  } catch {
    isRepo = false;
  }
  if (!isRepo) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }
}

/** Commit the currently-staged changes with `message`. Returns the new hash. */
export async function commitStaged(
  repoPath: string,
  message: string,
): Promise<string> {
  const result = await git(repoPath).commit(message);
  return result.commit;
}

/**
 * Return up to `limit` most-recent commits for the repo at `repoPath`,
 * newest first, with the full message (subject + body) for critique and
 * the subject alone kept separately for one-word detection.
 */
export async function getRecentCommits(
  repoPath: string,
  limit: number = DEFAULT_COMMIT_LIMIT,
): Promise<CommitRecord[]> {
  const log = await git(repoPath).log({
    maxCount: limit,
    format: {
      hash: "%H",
      subject: "%s",
      body: "%b",
      author: "%an",
      date: "%aI",
    },
  });
  return log.all.map((c) => {
    const subject = c.subject.trim();
    const body = c.body.trim();
    return {
      hash: c.hash,
      subject,
      message: body ? `${subject}\n\n${body}` : subject,
      author: c.author,
      date: c.date,
    };
  });
}

/**
 * Shallow-clone `url` into a fresh temp directory and return its path.
 * Caller is responsible for passing the path to {@link cleanupClone}.
 */
export async function cloneRemote(url: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "commit-critic-"));
  try {
    await simpleGit().clone(url, dir, ["--depth", String(CLONE_DEPTH)]);
  } catch (err) {
    cleanupClone(dir);
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not clone ${url}: ${detail}`);
  }
  return dir;
}

/** Remove a directory created by {@link cloneRemote}. Never throws. */
export function cleanupClone(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

export interface StagedDiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  /** Per-file line-change totals, most-changed first. */
  files: { file: string; changes: number }[];
}

/** Raw unified diff of everything currently staged (`git diff --staged`). */
export async function getStagedDiff(repoPath: string): Promise<string> {
  return git(repoPath).diff(["--staged"]);
}

/** Summary counts for the staged diff, for the "N files changed" line. */
export async function getStagedDiffStats(
  repoPath: string,
): Promise<StagedDiffStats> {
  const summary = await git(repoPath).diffSummary(["--staged"]);
  return {
    filesChanged: summary.changed,
    insertions: summary.insertions,
    deletions: summary.deletions,
    files: summary.files
      .map((f) => ({
        file: f.file,
        changes: "changes" in f ? f.changes : 0,
      }))
      .sort((a, b) => b.changes - a.changes),
  };
}
