import { simpleGit, type SimpleGit } from "simple-git";

export interface CommitRecord {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export const DEFAULT_COMMIT_LIMIT = 50;

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
