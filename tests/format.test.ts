import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AnalyzeResult } from "../src/analyze.js";
import {
  colorScore,
  formatCommitMessage,
  relativeDate,
  renderAnalysis,
  renderSuggestion,
  scoreBar,
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

describe("scoreBar", () => {
  it("fills to the score across 10 cells", () => {
    expect(stripAnsi(scoreBar(3))).toBe("▰▰▰▱▱▱▱▱▱▱");
    expect(stripAnsi(scoreBar(0))).toBe("▱▱▱▱▱▱▱▱▱▱");
    expect(stripAnsi(scoreBar(10))).toBe("▰▰▰▰▰▰▰▰▰▰");
  });
});

describe("relativeDate", () => {
  const now = new Date("2026-01-10T00:00:00Z");
  it("formats an age in the largest sensible unit", () => {
    expect(relativeDate("2026-01-09T00:00:00Z", now)).toBe("1 day ago");
    expect(relativeDate("2026-01-03T00:00:00Z", now)).toBe("1 week ago");
    expect(relativeDate("2026-01-09T23:59:30Z", now)).toBe("30 seconds ago");
  });
  it("returns empty string for an unparseable date", () => {
    expect(relativeDate("not-a-date", now)).toBe("");
  });
});

describe("renderAnalysis", () => {
  // Freeze "now" so relative-date metadata is deterministic in the snapshot.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T00:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  const result: AnalyzeResult = {
    analyzed: 2,
    needsWork: [
      {
        commit: "wip",
        score: 1,
        issue: "no info",
        better: "say what",
        whyItsGood: "n/a",
        hash: "abcdef1234",
        author: "Ada",
        date: "2026-01-01T00:00:00Z",
      },
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
    summary: {
      commits: 2,
      averageScore: 5,
      grade: "D",
      needWork: 1,
      wellWritten: 1,
      distribution: [
        { label: "1-3", count: 1 },
        { label: "4-6", count: 0 },
        { label: "7-10", count: 1 },
      ],
    },
    warnings: [],
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

  it("shows the summary line and score-spread histogram", () => {
    const out = stripAnsi(renderAnalysis(result));
    expect(out).toContain("2 commits");
    expect(out).toContain("grade D");
    expect(out).toContain("Score spread:");
    expect(out).toMatch(/1-3\s+█+ 1/);
  });

  it("shows commit metadata when present", () => {
    const out = stripAnsi(renderAnalysis(result));
    expect(out).toContain("abcdef1 · Ada ·");
  });

  it("indents multi-line commit bodies under the opening quote", () => {
    const out = stripAnsi(renderAnalysis(result));
    expect(out).toContain('Commit: "feat(api): add cache\n\n         - ttl"');
  });

  it("matches the full rendered layout (ANSI-stripped)", () => {
    expect(stripAnsi(renderAnalysis(result))).toMatchSnapshot();
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
    const out = stripAnsi(
      renderSuggestion({
        type: "refactor",
        scope: "auth",
        summary: "improve error handling",
        body: ["Add error types", "Update tests"],
        changeTypes: ["x"],
      }),
    );
    expect(out).toContain("Suggested commit message:");
    expect(out).toContain("refactor(auth): improve error handling");
    expect(out).toContain("- Add error types");
  });
});
