import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

export interface CommitRecord {
  hash: string;
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

/**
 * Return up to `limit` most-recent commits for the repo at `repoPath`,
 * newest first. Uses only the commit subject (first line) as `message`,
 * which is what commit-message critique operates on.
 */
export async function getRecentCommits(
  repoPath: string,
  limit: number = DEFAULT_COMMIT_LIMIT,
): Promise<CommitRecord[]> {
  const log = await git(repoPath).log({ maxCount: limit });
  return log.all.map((c) => ({
    hash: c.hash,
    message: c.message,
    author: c.author_name,
    date: c.date,
  }));
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
