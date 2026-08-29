import { describe, expect, it } from "vitest";
import type { AnalyzeResult } from "../src/analyze.js";
import {
  colorScore,
  formatCommitMessage,
  renderAnalysis,
  renderSuggestion,
} from "../src/format.js";

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, "");

describe("colorScore", () => {
  it("labels the score n/10 regardless of colour", () => {
    expect(stripAnsi(colorScore(2))).toBe("2/10");
    expect(stripAnsi(colorScore(6))).toBe("6/10");
    expect(stripAnsi(colorScore(9))).toBe("9/10");
  });
});

describe("renderAnalysis", () => {
  const result: AnalyzeResult = {
    analyzed: 2,
    needsWork: [
      { commit: "wip", score: 1, issue: "no info", better: "say what", whyItsGood: "n/a" },
    ],
    wellWritten: [
      {
        commit: "feat(api): add cache\n\n- ttl",
        score: 9,
        issue: "n/a",
        better: "n/a",
        whyItsGood: "clear scope",
      },
    ],
    stats: {
      averageScore: 5,
      vagueCount: 1,
      vaguePercent: 50,
      oneWordCount: 1,
      oneWordPercent: 50,
    },
  };

  it("renders all three boxed sections and the exact stat lines", () => {
    const out = stripAnsi(renderAnalysis(result));
    expect(out).toContain("💩 COMMITS THAT NEED WORK");
    expect(out).toContain("💎 WELL-WRITTEN COMMITS");
    expect(out).toContain("📊 YOUR STATS");
    expect(out).toContain('Commit: "wip"');
    expect(out).toContain("Issue: no info");
    expect(out).toContain('Better: "say what"');
    expect(out).toContain("Why it's good: clear scope");
    expect(out).toContain("Average score: 5.0/10");
    expect(out).toContain("Vague commits: 1 (50%)");
    expect(out).toContain("One-word commits: 1 (50%)");
  });

  it("indents multi-line commit bodies under the opening quote", () => {
    const out = stripAnsi(renderAnalysis(result));
    expect(out).toContain('Commit: "feat(api): add cache\n\n         - ttl"');
  });
});

describe("formatCommitMessage / renderSuggestion", () => {
  it("omits the parens when there is no scope", () => {
    expect(
      formatCommitMessage({
        type: "chore",
        scope: "",
        summary: "tidy",
        body: [],
        changeTypes: ["x"],
      }),
    ).toBe("chore: tidy");
  });

  it("boxes the suggested message with type(scope): summary and bullets", () => {
    const out = renderSuggestion({
      type: "refactor",
      scope: "auth",
      summary: "improve error handling",
      body: ["Add error types", "Update tests"],
      changeTypes: ["x"],
    });
    expect(out).toContain("Suggested commit message:");
    expect(out).toContain("refactor(auth): improve error handling");
    expect(out).toContain("- Add error types");
  });
});
