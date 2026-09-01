import { describe, expect, it } from "vitest";
import {
  CommitCritiqueListSchema,
  CommitCritiqueSchema,
  CommitSuggestionSchema,
} from "../src/schema.js";

const validCritique = {
  commit: "wip",
  score: 2,
  issue: "Too vague",
  better: "fix(auth): handle expired tokens",
  whyItsGood: "n/a",
};

describe("CommitCritiqueSchema", () => {
  it("accepts a well-formed critique", () => {
    expect(CommitCritiqueSchema.safeParse(validCritique).success).toBe(true);
  });

  it("rejects a score outside 1-10", () => {
    expect(
      CommitCritiqueSchema.safeParse({ ...validCritique, score: 11 }).success,
    ).toBe(false);
    expect(
      CommitCritiqueSchema.safeParse({ ...validCritique, score: 0 }).success,
    ).toBe(false);
  });

  it("rejects a non-integer score", () => {
    expect(
      CommitCritiqueSchema.safeParse({ ...validCritique, score: 4.5 }).success,
    ).toBe(false);
  });

  it("rejects a missing field", () => {
    const { better: _omit, ...rest } = validCritique;
    expect(CommitCritiqueSchema.safeParse(rest).success).toBe(false);
  });
});

describe("CommitCritiqueListSchema", () => {
  it("parses a wrapped list", () => {
    const parsed = CommitCritiqueListSchema.safeParse({
      critiques: [validCritique, { ...validCritique, score: 9 }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.critiques).toHaveLength(2);
  });

  it("rejects a bare array (must be wrapped)", () => {
    expect(CommitCritiqueListSchema.safeParse([validCritique]).success).toBe(
      false,
    );
  });
});

describe("CommitSuggestionSchema", () => {
  const valid = {
    type: "refactor",
    scope: "auth",
    summary: "improve error handling",
    body: ["Add specific error types", "Update tests"],
    changeTypes: ["Modified auth logic"],
  };

  it("accepts a well-formed suggestion", () => {
    expect(CommitSuggestionSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an empty scope", () => {
    expect(
      CommitSuggestionSchema.safeParse({ ...valid, scope: "" }).success,
    ).toBe(true);
  });

  it("rejects an unknown conventional-commit type", () => {
    expect(
      CommitSuggestionSchema.safeParse({ ...valid, type: "bogus" }).success,
    ).toBe(false);
  });

  it("rejects an empty changeTypes list", () => {
    expect(
      CommitSuggestionSchema.safeParse({ ...valid, changeTypes: [] }).success,
    ).toBe(false);
  });
});
