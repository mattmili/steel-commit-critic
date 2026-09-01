import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import type { ZodSchema } from "zod";
import type { CommitRecord, StagedDiffStats } from "./git.js";
import {
  CommitCritiqueListSchema,
  CommitSuggestionSchema,
  type CommitCritique,
  type CommitSuggestion,
} from "./schema.js";

const DEFAULT_MODEL = "claude-sonnet-5";

/** Cap the diff we send so a huge staged change can't blow the context. */
const MAX_DIFF_CHARS = 12_000;

function getClient(): { client: Anthropic; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.",
    );
  }
  const model = process.env.COMMIT_CRITIC_MODEL || DEFAULT_MODEL;
  return { client: new Anthropic({ apiKey }), model };
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Pull a JSON object out of a model reply that may be fenced or padded. */
function stripToJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start !== -1 && end !== -1 ? body.slice(start, end + 1) : body;
}

/**
 * Call the model, parse its reply as JSON, and validate against `schema`.
 * Retries once with a corrective nudge, then throws a clear error.
 */
const DEBUG = Boolean(process.env.COMMIT_CRITIC_DEBUG);

async function requestJson<T>(
  schema: ZodSchema<T>,
  system: string,
  user: string,
  maxTokens = 8192,
): Promise<T> {
  const { client, model } = getClient();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  let lastReason = "no response";

  for (let attempt = 1; attempt <= 2; attempt++) {
    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Anthropic API request failed: ${detail}`);
    }

    const text = extractText(message);
    if (DEBUG) {
      console.error(
        `\n[commit-critic] attempt ${attempt} stop_reason=${message.stop_reason} ` +
          `output_tokens=${message.usage.output_tokens}\n${text}\n`,
      );
    }

    if (message.stop_reason === "max_tokens") {
      lastReason = `response was cut off at the ${maxTokens}-token limit`;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripToJson(text));
    } catch {
      parsed = undefined;
      if (message.stop_reason !== "max_tokens") {
        lastReason = "response was not valid JSON";
      }
    }

    const result =
      parsed === undefined
        ? { success: false as const, error: undefined }
        : schema.safeParse(parsed);

    if (result.success) return result.data;

    if (parsed !== undefined && !result.success && result.error) {
      lastReason = `JSON did not match schema: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`;
    }

    if (attempt === 2) {
      throw new Error(
        `LLM response could not be used after a retry (${lastReason}). ` +
          `Re-run with COMMIT_CRITIC_DEBUG=1 to see the raw output.`,
      );
    }

    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content:
          "That response was not valid JSON matching the schema. Reply again " +
          "with ONLY the JSON object, no prose, no code fences.",
      },
    );
  }

  // Unreachable: the loop always returns or throws.
  throw new Error("LLM request loop exited unexpectedly.");
}

const CRITIQUE_SYSTEM = `You are a senior engineer reviewing Git commit messages.

Score each commit from 1 (useless) to 10 (exemplary) against this rubric:
- Specificity: names what changed and where; not "fixed bug" / "wip" / "updates".
- Imperative mood: "add x", not "added x" / "adds x".
- Scope clarity: the affected area is obvious (a conventional-commit scope helps).
- Explains why, not only what: the motivation or impact is present for non-trivial changes.
- Conventional-commit format: type(scope): summary, with a useful body when warranted.

Guidance on scores: 1-3 vague or empty; 4-5 understandable but weak; 6-7 solid;
8-10 specific, imperative, well-scoped, and explains impact.

For EVERY commit provide all of:
- "issue": the single biggest problem (used when the score is low).
- "better": a concrete rewritten commit message (used when the score is low).
- "whyItsGood": what this message does well (used when the score is high).

Keep each of "issue", "better", and "whyItsGood" to a single short sentence.
Return ONLY a JSON object of the form:
{"critiques":[{"commit": "<original message>", "score": <int>, "issue": "...", "better": "...", "whyItsGood": "..."}]}
Keep "commit" equal to the original message you were given. No prose. No code fences.`;

/** Commits per LLM call, to keep each JSON response well under the token cap. */
const CRITIQUE_BATCH_SIZE = 15;

async function critiqueBatch(
  commits: CommitRecord[],
): Promise<CommitCritique[]> {
  const list = commits
    .map((c, i) => `${i + 1}. ${JSON.stringify(c.message)}`)
    .join("\n");
  const user = `Critique these ${commits.length} commit messages:\n\n${list}`;
  const { critiques } = await requestJson(
    CommitCritiqueListSchema,
    CRITIQUE_SYSTEM,
    user,
    8192,
  );
  return critiques;
}

export async function critiqueCommits(
  commits: CommitRecord[],
): Promise<CommitCritique[]> {
  if (commits.length === 0) return [];

  const batches: CommitRecord[][] = [];
  for (let i = 0; i < commits.length; i += CRITIQUE_BATCH_SIZE) {
    batches.push(commits.slice(i, i + CRITIQUE_BATCH_SIZE));
  }

  const results: CommitCritique[] = [];
  for (const batch of batches) {
    results.push(...(await critiqueBatch(batch)));
  }
  return results;
}

const SUGGEST_SYSTEM = `You draft Conventional Commits messages from a staged Git diff.

Steps:
1. Classify the concrete changes as short human-readable phrases (for "changeTypes"),
   e.g. "Modified authentication logic", "Added error handling", "Updated unit tests".
2. Pick the single best type from: feat, fix, docs, style, refactor, perf, test,
   build, ci, chore, revert.
3. Pick a concise scope (lowercase, one token) or "" if none fits.
4. Write an imperative summary under ~72 characters, no trailing period.
5. Write body bullet lines (without leading "- ") describing what changed and why.

Return ONLY a JSON object:
{"type": "...", "scope": "...", "summary": "...", "body": ["...", "..."], "changeTypes": ["...", "..."]}
No prose. No code fences.`;

export async function suggestCommitMessage(
  diff: string,
  stats: StagedDiffStats,
): Promise<CommitSuggestion> {
  const clipped =
    diff.length > MAX_DIFF_CHARS
      ? `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[diff truncated]`
      : diff;
  const fileList = stats.files.map((f) => `- ${f.file} (${f.changes})`).join("\n");
  const user =
    `Staged diff: ${stats.filesChanged} files changed, ` +
    `+${stats.insertions} -${stats.deletions} lines.\n\n` +
    `Files:\n${fileList}\n\n` +
    `Unified diff:\n${clipped}`;

  return requestJson(CommitSuggestionSchema, SUGGEST_SYSTEM, user);
}
