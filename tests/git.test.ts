import { beforeEach, describe, expect, it, vi } from "vitest";

const gitMock = vi.hoisted(() => ({
  log: vi.fn(),
  diff: vi.fn(),
  diffSummary: vi.fn(),
  checkIsRepo: vi.fn(),
  clone: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => gitMock),
  default: vi.fn(() => gitMock),
}));

import {
  assertGitRepo,
  commitStaged,
  getRecentCommits,
  getStagedDiffStats,
} from "../src/git.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRecentCommits", () => {
  it("maps log entries and joins subject + body into message", async () => {
    gitMock.log.mockResolvedValue({
      all: [
        {
          hash: "abc123",
          subject: "feat(api): add caching",
          body: "- adds TTL\n- 200ms faster",
          author: "Ada",
          date: "2026-01-01T00:00:00Z",
        },
        {
          hash: "def456",
          subject: "wip",
          body: "",
          author: "Ada",
          date: "2026-01-02T00:00:00Z",
        },
      ],
    });

    const commits = await getRecentCommits("/repo", 50);

    expect(gitMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ maxCount: 50 }),
    );
    expect(commits[0]).toEqual({
      hash: "abc123",
      subject: "feat(api): add caching",
      message: "feat(api): add caching\n\n- adds TTL\n- 200ms faster",
      author: "Ada",
      date: "2026-01-01T00:00:00Z",
    });
    expect(commits[1].message).toBe("wip");
  });
});

describe("getStagedDiffStats", () => {
  it("maps diffSummary and sorts files by change count", async () => {
    gitMock.diffSummary.mockResolvedValue({
      changed: 2,
      insertions: 10,
      deletions: 3,
      files: [
        { file: "a.ts", changes: 2 },
        { file: "b.ts", changes: 11 },
      ],
    });

    const stats = await getStagedDiffStats("/repo");

    expect(gitMock.diffSummary).toHaveBeenCalledWith(["--staged"]);
    expect(stats.filesChanged).toBe(2);
    expect(stats.insertions).toBe(10);
    expect(stats.deletions).toBe(3);
    expect(stats.files.map((f) => f.file)).toEqual(["b.ts", "a.ts"]);
  });
});

describe("assertGitRepo", () => {
  it("resolves when the path is a repo", async () => {
    gitMock.checkIsRepo.mockResolvedValue(true);
    await expect(assertGitRepo("/repo")).resolves.toBeUndefined();
  });

  it("throws when the path is not a repo", async () => {
    gitMock.checkIsRepo.mockResolvedValue(false);
    await expect(assertGitRepo("/nope")).rejects.toThrow(
      "Not a git repository: /nope",
    );
  });

  it("throws when checkIsRepo itself fails", async () => {
    gitMock.checkIsRepo.mockRejectedValue(new Error("boom"));
    await expect(assertGitRepo("/nope")).rejects.toThrow("Not a git repository");
  });
});

describe("commitStaged", () => {
  it("commits the message and returns the new hash", async () => {
    gitMock.commit.mockResolvedValue({ commit: "9f9f9f9" });
    const hash = await commitStaged("/repo", "chore: thing");
    expect(gitMock.commit).toHaveBeenCalledWith("chore: thing");
    expect(hash).toBe("9f9f9f9");
  });
});
