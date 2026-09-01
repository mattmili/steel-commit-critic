import { describe, expect, it } from "vitest";
import { computeStats, isOneWord } from "../src/analyze.js";
import type { CommitRecord } from "../src/git.js";
import type { CommitCritique } from "../src/schema.js";

function commit(subject: string): CommitRecord {
  return { hash: "h", subject, message: subject, author: "a", date: "d" };
}

function critique(score: number): CommitCritique {
  return {
    commit: "c",
    score,
    issue: "i",
    better: "b",
    whyItsGood: "w",
  };
}

describe("isOneWord", () => {
  it.each([
    ["wip", true],
    ["fixed.", true],
    ["Updates", true],
    ["fix: thing", false],
    ["add redis cache", false],
    ["", false],
  ])("%s -> %s", (subject, expected) => {
    expect(isOneWord(subject)).toBe(expected);
  });
});

describe("computeStats", () => {
  it("computes average, vague %, and one-word % against the commit count", () => {
    const commits = [commit("wip"), commit("fixed"), commit("feat: add x")];
    const critiques = [critique(2), critique(3), critique(9)];

    const stats = computeStats(commits, critiques);

    expect(stats.averageScore).toBeCloseTo(4.7, 5);
    expect(stats.vagueCount).toBe(2); // scores 2 and 3 are < 4
    expect(stats.vaguePercent).toBe(67);
    expect(stats.oneWordCount).toBe(2); // "wip", "fixed"
    expect(stats.oneWordPercent).toBe(67);
  });

  it("returns zeros for an empty set", () => {
    const stats = computeStats([], []);
    expect(stats).toEqual({
      averageScore: 0,
      vagueCount: 0,
      vaguePercent: 0,
      oneWordCount: 0,
      oneWordPercent: 0,
    });
  });
});
