import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitRecord } from "../src/git.js";

const create = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create };
  },
}));

import { critiqueCommits, suggestCommitMessage } from "../src/llm.js";

/** Build a fake Messages API response. */
function reply(text: string, stopReason = "end_turn"): unknown {
  return {
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    usage: { output_tokens: 42 },
  };
}

function commit(message: string, i = 0): CommitRecord {
  return {
    hash: `hash${i}`,
    subject: message.split("\n")[0] ?? message,
    message,
    author: "Ada",
    date: "2026-01-01T00:00:00Z",
  };
}

const critiqueJson = (commits: CommitRecord[]) =>
  JSON.stringify({
    critiques: commits.map((c) => ({
      commit: c.message,
      score: 5,
      issue: "vague",
      better: "be specific",
      whyItsGood: "n/a",
    })),
  });

const suggestJson = JSON.stringify({
  type: "refactor",
  scope: "auth",
  summary: "improve error handling",
  body: ["Add error types"],
  changeTypes: ["Modified auth logic"],
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  create.mockReset();
});

describe("critiqueCommits", () => {
  it("parses a valid single-batch response and sends temperature 0", async () => {
    const commits = [commit("wip", 1), commit("feat: add x", 2)];
    create.mockResolvedValueOnce(reply(critiqueJson(commits)));

    const { critiques, failedBatches } = await critiqueCommits(commits);

    expect(failedBatches).toBe(0);
    expect(critiques).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      temperature: 0,
      max_tokens: 8192,
    });
  });

  it("unwraps a fenced ```json code block", async () => {
    const commits = [commit("wip", 1)];
    create.mockResolvedValueOnce(
      reply("```json\n" + critiqueJson(commits) + "\n```"),
    );
    const { critiques } = await critiqueCommits(commits);
    expect(critiques).toHaveLength(1);
  });

  it("retries once on an unusable reply, then succeeds", async () => {
    const commits = [commit("wip", 1)];
    create
      .mockResolvedValueOnce(reply("not json at all"))
      .mockResolvedValueOnce(reply(critiqueJson(commits)));

    const { critiques } = await critiqueCommits(commits);

    expect(create).toHaveBeenCalledTimes(2);
    expect(critiques).toHaveLength(1);
  });

  it("throws with the schema reason after a failed retry", async () => {
    const commits = [commit("wip", 1)];
    create.mockResolvedValue(reply(JSON.stringify({ critiques: [{ score: 99 }] })));

    await expect(critiqueCommits(commits)).rejects.toThrow(
      /did not match the expected schema|Could not critique/i,
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("reports the token limit when the reply was cut off", async () => {
    const commits = [commit("wip", 1)];
    create.mockResolvedValue(reply('{"critiques":[', "max_tokens"));

    await expect(critiqueCommits(commits)).rejects.toThrow(/cut off/i);
  });

  it("splits >15 commits into batches and reports partial failure", async () => {
    const commits = Array.from({ length: 20 }, (_, i) => commit(`c${i}`, i));
    create
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(reply(critiqueJson(commits.slice(15))));

    const { critiques, failedBatches } = await critiqueCommits(commits);

    expect(create).toHaveBeenCalledTimes(2);
    expect(failedBatches).toBe(1);
    expect(critiques).toHaveLength(5);
  });

  it("reports progress per batch", async () => {
    const commits = Array.from({ length: 20 }, (_, i) => commit(`c${i}`, i));
    create
      .mockResolvedValueOnce(reply(critiqueJson(commits.slice(0, 15))))
      .mockResolvedValueOnce(reply(critiqueJson(commits.slice(15))));
    const seen: Array<[number, number]> = [];

    await critiqueCommits(commits, {
      onProgress: (done, total) => seen.push([done, total]),
    });

    expect(seen).toEqual([
      [15, 20],
      [20, 20],
    ]);
  });

  it("throws a clear error when the API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(critiqueCommits([commit("wip", 1)])).rejects.toThrow(
      "ANTHROPIC_API_KEY is not set",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("returns empty without calling the API for no commits", async () => {
    const out = await critiqueCommits([]);
    expect(out).toEqual({ critiques: [], failedBatches: 0 });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("suggestCommitMessage", () => {
  const stats = {
    filesChanged: 2,
    insertions: 10,
    deletions: 3,
    files: [{ file: "a.ts", changes: 13 }],
  };

  it("parses a valid suggestion", async () => {
    create.mockResolvedValueOnce(reply(suggestJson));
    const s = await suggestCommitMessage("diff --git a/a.ts b/a.ts", stats);
    expect(s).toMatchObject({
      type: "refactor",
      scope: "auth",
      summary: "improve error handling",
    });
  });

  it("rejects when the key is missing before any request", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(suggestCommitMessage("diff", stats)).rejects.toThrow(
      "ANTHROPIC_API_KEY is not set",
    );
    expect(create).not.toHaveBeenCalled();
  });
});
