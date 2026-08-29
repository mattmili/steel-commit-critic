import { z } from "zod";

/**
 * The LLM must return JSON matching these schemas rather than free-form
 * prose, so scores and critiques are structured, validated, and
 * reproducible. Every call is run through `safeParse` before use.
 */

/** Conventional-commit types accepted in a suggested message. */
export const CONVENTIONAL_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
] as const;

/**
 * One critiqued commit. `issue`/`better` drive the "needs work" section,
 * `whyItsGood` drives the "well-written" section; the LLM fills all three
 * for every commit and the renderer picks per score.
 */
export const CommitCritiqueSchema = z.object({
  commit: z.string().min(1),
  score: z.number().int().min(1).max(10),
  issue: z.string().min(1),
  better: z.string().min(1),
  whyItsGood: z.string().min(1),
});
export type CommitCritique = z.infer<typeof CommitCritiqueSchema>;

export const CommitCritiqueListSchema = z.object({
  critiques: z.array(CommitCritiqueSchema),
});
export type CommitCritiqueList = z.infer<typeof CommitCritiqueListSchema>;

/** A drafted conventional-commit message for the staged diff. */
export const CommitSuggestionSchema = z.object({
  type: z.enum(CONVENTIONAL_TYPES),
  /** May be empty when no single scope fits. */
  scope: z.string(),
  summary: z.string().min(1),
  /** Body bullet lines, without the leading "- ". */
  body: z.array(z.string().min(1)),
  /** Human-readable change descriptions for the "Changes detected:" list. */
  changeTypes: z.array(z.string().min(1)).min(1),
});
export type CommitSuggestion = z.infer<typeof CommitSuggestionSchema>;
