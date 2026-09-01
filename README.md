# commit-critic

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

# Interactive commit writer for staged changes
commit-critic --write
```

### `--analyze` output

```
Analyzing last 50 commits...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💩 COMMITS THAT NEED WORK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commit: "fixed bug"
Score: 2/10
Issue: Too vague - which bug? What was the impact?
Better: "fix(auth): resolve token expiration handling"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 WELL-WRITTEN COMMITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commit: "feat(api): add Redis caching layer
         - Implement cache for read endpoints
         - Add TTL configuration"
Score: 9/10
Why it's good: Clear scope, specific changes, measurable impact

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 YOUR STATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Average score: 4.2/10
Vague commits: 34 (68%)
One-word commits: 12 (24%)
```

Scores are color-coded: red below 4, yellow 4–7, green 8 and above.

### `--write` output

```
Analyzing staged changes... (12 files changed, +247 -89 lines)

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

Press Enter to accept, or type your own message:
>
```

Pressing Enter commits the suggested message. Typing text and pressing Enter
commits that instead.

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

- **Reproducibility** — scores and critiques come back in fixed fields, so the
  same commit history produces a comparable report each run.
- **Validation** — every response goes through `schema.safeParse`. On a
  malformed reply the tool retries once with a corrective instruction, then
  fails with a clear error rather than rendering garbage.
- **Rendering** — the formatter consumes typed data, so the output layout is
  decoupled from model phrasing.

## Development

```bash
npm test           # vitest run
npm run test:watch
npm run typecheck
```

Tests cover `git.ts` (with `simple-git` mocked), the zod schemas
(valid/invalid LLM responses), the stats math, and the report formatter.

> Note: `npm audit` reports advisories in `vitest`'s transitive `esbuild`/`vite`
> dev dependencies. They do not affect the shipped CLI (runtime deps only:
> commander, simple-git, @anthropic-ai/sdk, zod, chalk, dotenv).

## Dependencies

**Runtime:** `commander`, `simple-git`, `@anthropic-ai/sdk`, `zod`, `chalk`,
`dotenv`
**Dev:** `typescript`, `tsx`, `vitest`, `@types/node`

## License

MIT
