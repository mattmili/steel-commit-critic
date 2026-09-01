# commit-critic

[![CI](https://github.com/mattmili/steel-commit-critic/actions/workflows/ci.yml/badge.svg)](https://github.com/mattmili/steel-commit-critic/actions/workflows/ci.yml)

An AI-powered terminal tool that critiques Git commit message quality and helps
you write better commits. It has two modes:

- **`--analyze`** — fetches the last 50 commits (from the current repo, or a
  cloned remote via `--url`), sends them to an LLM for critique, and prints a
  formatted report with per-commit scores and aggregate stats.
- **`--write`** — reads `git diff --staged`, asks the LLM for a
  conventional-commit-style message, and lets you press Enter to accept it or
  type your own.

## Requirements

- Node.js >= 18
- An Anthropic API key

## Setup

```bash
npm install
npm run build
```

To run the CLI globally as `commit-critic`:

```bash
npm link
```

Or run it without installing:

```bash
npm run dev -- --analyze      # tsx src/cli.ts
node dist/cli.js --analyze     # after npm run build
```

## API key configuration

The tool uses the **Anthropic API** (`@anthropic-ai/sdk`). Copy the example env
file and add your key:

```bash
cp .env.example .env
```

```
ANTHROPIC_API_KEY=sk-ant-...
# optional, defaults to claude-sonnet-5
# COMMIT_CRITIC_MODEL=claude-sonnet-5
```

The key is loaded from `.env` via `dotenv`. `.env` is gitignored.

## Usage

```bash
# Analyze the last 50 commits of the current repo
commit-critic --analyze

# Analyze the last 50 commits of a remote repo
commit-critic --analyze --url="https://github.com/steel-dev/steel-browser"

# Review a different number of commits
commit-critic --analyze --limit 20

# Machine-readable output (skips the spinner and colour)
commit-critic --analyze --json | jq '.summary'

# Fail (exit 1) if the average score is below 6 — usable as a CI check
commit-critic --analyze --fail-under 6

# Interactive commit writer for staged changes
commit-critic --write
```

| Flag | Mode | Effect |
| --- | --- | --- |
| `--url <url>` | analyze | Analyze a shallow clone of a remote repo instead of the cwd. |
| `--limit <n>` | analyze | Number of commits to review (default 50). |
| `--json` | analyze | Print the raw `AnalyzeResult` as JSON on stdout; no spinner or colour. |
| `--fail-under <score>` | analyze | Exit non-zero when the average score is below `<score>` (0–10). |
| `-v, --version` | — | Print the version. |

A spinner runs on stderr during LLM calls, so `--json` and piped output stay
clean. Colour is disabled automatically when stdout is not a TTY.

### `--analyze` output

A full sample is in [`docs/example-analyze.txt`](docs/example-analyze.txt).

```
Analyzing last 50 commits...
✓ Critique complete

50 commits  ·  avg 4.2/10  ·  grade D  ·  34 need work  ·  9 solid

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💩 COMMITS THAT NEED WORK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commit: "fixed bug"
         a1b2c3d · Ada Lovelace · 2 weeks ago
Score: 2/10  ▰▰▱▱▱▱▱▱▱▱
Issue: Too vague - which bug? What was the impact?
Better: "fix(auth): resolve token expiration handling"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 WELL-WRITTEN COMMITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commit: "feat(api): add Redis caching layer

         - Implement cache for read endpoints
         - Add TTL configuration"
         9a9a9a9 · Bob Vance · 3 days ago
Score: 9/10  ▰▰▰▰▰▰▰▰▰▱
Why it's good: Clear scope, specific changes, measurable impact

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 YOUR STATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Average score: 4.2/10
Vague commits: 34 (68%)
One-word commits: 12 (24%)

Score spread:
  1-3  ████████████████████ 24
  4-6  ██████████ 12
  7-10 ███████ 9
```

Scores are color-coded: red below 4, yellow 4–7, green 8 and above. The bar,
summary line, commit metadata, and score-spread histogram are additive to the
required layout.

### `--write` output

```
Analyzing staged changes... (12 files changed, +247 -89 lines)

  src/auth/session.ts  ▍▍▍▍▍▍▍▍▍▍▍▍ 96
  src/auth/errors.ts   ▍▍▍▍▍ 41
  tests/auth.test.ts   ▍▍▍ 22

✓ Draft ready
Changes detected:
- Modified authentication logic
- Added error handling
- Updated unit tests

Suggested commit message:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
refactor(auth): improve error handling

- Add specific error types for auth failures
- Extract validation into separate methods
- Update tests to cover edge cases
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Press Enter to accept, type your own message, or 'r' to regenerate:
>
```

Pressing Enter commits the suggested message; typing text commits that instead;
`r` asks the LLM for a fresh draft.

## Scoring rubric

The critique prompt scores each commit from 1 to 10 against five criteria:

| Criterion | What it checks |
| --- | --- |
| **Specificity** | Names what changed and where — not `fixed bug`, `wip`, `updates`. |
| **Imperative mood** | `add x`, not `added x` / `adds x`. |
| **Scope clarity** | The affected area is obvious (a conventional-commit scope helps). |
| **Explains why, not just what** | Motivation or impact is present for non-trivial changes. |
| **Conventional-commit format** | `type(scope): summary` with a useful body when warranted. |

Score bands: 1–3 vague or empty, 4–5 understandable but weak, 6–7 solid, 8–10
specific, imperative, well-scoped, and explains impact.

Report thresholds:

- **Needs work** vs **well-written**: score `< 6` vs `>= 6`.
- **Vague commits** stat: score `< 4`.
- **One-word commits** stat: the subject line is a single bare token.

## Why structured JSON output

The LLM is required to return JSON matching a [zod](https://zod.dev) schema
(`src/schema.ts`), not free-form prose:

- **Reproducibility** — scores and critiques come back in fixed fields, and the
  model is called with `temperature: 0`, so the same commit history produces a
  comparable report each run.
- **Validation** — every response goes through `schema.safeParse`. On a
  malformed reply the tool retries once with a corrective instruction, then
  fails with a clear error (naming the cause: token limit, invalid JSON, or the
  specific schema violation).
- **Rendering** — the formatter consumes typed data, so the output layout is
  decoupled from model phrasing, and `--json` falls out for free.

Commits are critiqued in batches of 15 so no single response hits the token
limit; a failed batch is skipped with a warning rather than failing the run.
Set `COMMIT_CRITIC_DEBUG=1` to print each model response.

## Development

```bash
npm test           # vitest run (79 tests)
npm run test:watch
npm run typecheck
```

Tests cover:

- `cli.ts` — flag parsing, mode resolution, `--fail-under` / `--limit` validation.
- `git.ts` — `simple-git` mocked (log/body join, diff-stats, `assertGitRepo`, commit).
- `llm.ts` — `@anthropic-ai/sdk` mocked: valid/fenced JSON, the retry path, the
  token-limit and schema-mismatch errors, batch splitting, partial-failure
  accounting, progress callbacks, and the missing-key short-circuit.
- `analyze.ts` — `computeStats` / grading / `scoreDistribution` / `enrichCritiques`,
  plus `runAnalyze` end-to-end (report, `--json`, `--fail-under`, warnings) with
  `git`/`llm` mocked.
- `format.ts` — score bars, relative dates, histogram, and a full ANSI-stripped
  snapshot of `renderAnalysis` (time frozen for determinism).

### Demo GIF

[`docs/demo.tape`](docs/demo.tape) is a [vhs](https://github.com/charmbracelet/vhs)
script: `vhs docs/demo.tape` writes `docs/demo.gif`.

> Note: `npm audit` reports advisories in `vitest`'s transitive `esbuild`/`vite`
> dev dependencies. They do not affect the shipped CLI (runtime deps only:
> commander, simple-git, @anthropic-ai/sdk, zod, chalk, dotenv).

## Dependencies

**Runtime:** `commander`, `simple-git`, `@anthropic-ai/sdk`, `zod`, `chalk`,
`dotenv`
**Dev:** `typescript`, `tsx`, `vitest`, `@types/node`

## License

MIT
