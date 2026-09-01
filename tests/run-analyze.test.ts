import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitRecord } from "../src/git.js";
import type { CommitCritique } from "../src/schema.js";

const getRecentCommits = vi.hoisted(() => vi.fn());
const critiqueCommits = vi.hoisted(() => vi.fn());

vi.mock("../src/git.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/git.js")>()),
  getRecentCommits,
  assertGitRepo: vi.fn().mockResolvedValue(undefined),
  cloneRemote: vi.fn(),
  cleanupClone: vi.fn(),
}));

vi.mock("../src/llm.js", () => ({ critiqueCommits }));

import { QualityGateError, runAnalyze } from "../src/analyze.js";

function commit(subject: string, i: number): CommitRecord {
  return {
    hash: `hash${i}`,
    subject,
    message: subject,
    author: "Ada",
    date: "2026-01-01T00:00:00Z",
  };
}

function critique(commitMsg: string, score: number): CommitCritique {
  return {
    commit: commitMsg,
    score,
    issue: "vague",
    better: "be specific",
    whyItsGood: "clear scope",
  };
}

let stdout: string;

beforeEach(() => {
  stdout = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  getRecentCommits.mockReset();
  critiqueCommits.mockReset();
});

describe("runAnalyze", () => {
  it("renders the report for the resolved commits", async () => {
    const commits = [commit("wip", 1), commit("feat(api): add cache", 2)];
    getRecentCommits.mockResolvedValue(commits);
    critiqueCommits.mockResolvedValue({
      critiques: [critique("wip", 2), critique("feat(api): add cache", 9)],
      failedBatches: 0,
    });

    await runAnalyze({ limit: 2 });

    expect(stdout).toContain("💩 COMMITS THAT NEED WORK");
    expect(stdout).toContain("Average score: 5.5/10");
  });

  it("emits JSON with --json and no human formatting", async () => {
    getRecentCommits.mockResolvedValue([commit("wip", 1)]);
    critiqueCommits.mockResolvedValue({
      critiques: [critique("wip", 3)],
      failedBatches: 0,
    });

    await runAnalyze({ json: true });

    const parsed = JSON.parse(stdout);
    expect(parsed.summary.averageScore).toBe(3);
    expect(parsed.analyzed).toBe(1);
    expect(stdout).not.toContain("YOUR STATS");
  });

  it("throws QualityGateError when the average is below --fail-under", async () => {
    getRecentCommits.mockResolvedValue([commit("wip", 1)]);
    critiqueCommits.mockResolvedValue({
      critiques: [critique("wip", 3)],
      failedBatches: 0,
    });

    await expect(runAnalyze({ failUnder: 6 })).rejects.toBeInstanceOf(
      QualityGateError,
    );
    // The report is still printed before the gate trips.
    expect(stdout).toContain("YOUR STATS");
  });

  it("passes when the average meets --fail-under", async () => {
    getRecentCommits.mockResolvedValue([commit("feat: x", 1)]);
    critiqueCommits.mockResolvedValue({
      critiques: [critique("feat: x", 8)],
      failedBatches: 0,
    });

    await expect(runAnalyze({ failUnder: 6 })).resolves.toBeUndefined();
  });

  it("surfaces a partial-failure warning", async () => {
    const errSpy = vi.spyOn(console, "error");
    getRecentCommits.mockResolvedValue([commit("wip", 1), commit("wip", 2)]);
    critiqueCommits.mockResolvedValue({
      critiques: [critique("wip", 2)],
      failedBatches: 1,
    });

    await runAnalyze({});

    expect(
      errSpy.mock.calls.some((c) => String(c[0]).includes("1 critique batch")),
    ).toBe(true);
  });
});
