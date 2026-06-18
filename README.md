# Issue Repro & Fix Agent (`reprokit`)

> **Turns vague bug reports into reproducible evidence and safe fix PRs.**
> _Convierte issues vagos en bugs reproducibles, informes claros y PRs seguros con aprobación humana._

Built on [**Vercel Eve**](https://vercel.com/docs/eve) — a filesystem-first
framework for durable backend AI agents. **Gemini** drives the Eve
orchestrator, while **Codex** and **Claude Code** run as external workers in
isolated checkouts.

---

## 1. What this is

A GitHub-issue agent that reacts to slash-commands in issue comments:

| Command | Action |
|---|---|
| `/repro` | Reproduce the bug in an isolated checkout and post a reproduction report |
| `/fix` | Run the full fix pipeline: reproduce, fix, check, verify again, then open a PR |
| `/fix codex` / `/fix claude` | Run the full fix pipeline with a specific worker |
| `/compare` | Run both workers read-only and compare diagnoses |
| `/stop` | Stop work on the issue |

The core flow:

```
GitHub issue → /repro → worker → reproduction report → human approval → /fix → checks → PR
```

Current `/fix` behavior reruns reproduction, posts a fix report, runs checks,
and verifies again before PR creation, even if `/repro` was already used.

## 2. What the MVP does

- ✅ Reads a GitHub issue (title, body, labels, comments, repo).
- ✅ Triages it and asks for more info when it's too thin.
- ✅ Clones the repo into an isolated `.runs/issue-<n>/repo` checkout.
- ✅ Runs a reproduction worker (Codex/Claude **or a mock** if the worker is absent).
- ✅ Detects browser/UI bugs and existing `e2e`/`playwright` scripts so workers
  can turn vague reports into browser-backed evidence.
- ✅ Generates `report.md` and posts it on the issue.
- ✅ **Waits for human approval** before any code change.
- ✅ On `/fix`: runs a fix worker, runs project checks, and — only if they pass —
  pushes `agent/fix-issue-<n>` and opens a PR (never auto-merged).
- ✅ `/compare`: runs both workers in **separate** checkouts and posts a table.
- ✅ Redacts secrets and refuses destructive commands.

### Playwright evidence

For UI/browser bugs, the repo is designed to use Playwright as the evidence
loop: reproduce the issue in a real browser, capture commands/logs/screenshots
or failing tests in the `/repro` report, then use the same Playwright/e2e script
as an optional post-fix gate. Normal `/fix` validation runs typecheck, lint,
unit tests, and build; set `RUN_BROWSER_CHECKS=1` to include detected `e2e` or
`playwright` scripts when you want browser confirmation before a PR opens.

## 3. What it does NOT do yet

- ❌ Linear is a **stub** (clean adapter, not implemented) — see [src/providers/linear-provider.ts](src/providers/linear-provider.ts).
- ❌ No GitHub App (uses a personal access token; App is designed-for, not required).
- ❌ No auto-merge, no deploy, no production DB/secrets.
- ❌ No dashboard/UI; state is files under `.runs/`.

---

## 4. Installation

```bash
# 1. Install dependencies (this fetches Eve + zod + dev tools)
npm install

# 2. After install, read Eve's real local docs to confirm beta APIs:
ls node_modules/eve/docs/

# 3. Configure environment
cp .env.example .env   # then edit .env
```

Local CLI/webhook runs load `.env` automatically when the file exists.

> **Note:** `npm run typecheck` only fully passes after `npm install` (the
> `agent/` files import `eve`). `npm test` works immediately — tests only depend
> on `src/`.

## 5. Configure Eve

`agent/agent.ts` selects the model through `@ai-sdk/google`, using a direct
Google AI Studio / Gemini API key. This repo defaults the Eve runtime model to
Gemini:

```ts
export default defineAgent({ model: agentModel });
```

Run the Eve dev server (intake via the GitHub channel — see §13):

```bash
npm run dev      # → eve dev
```

Or use the **standalone webhook** (Phase-1, no Eve runtime needed):

```bash
npm run webhook  # → starts http://127.0.0.1:3001/webhook
```

## 6. Configure a GitHub token

Create a token with `repo` scope and put it in `.env`:

```env
GITHUB_TOKEN=ghp_xxx
GITHUB_OWNER=your-org
GITHUB_REPO=your-repo
GITHUB_WEBHOOK_SECRET=some-strong-secret   # required for the webhook in production
```

For webhook delivery, add a GitHub webhook (repo Settings → Webhooks):
- **Payload URL:** your public `…/webhook` (use a tunnel like `ngrok` locally)
- **Content type:** `application/json`
- **Secret:** the same `GITHUB_WEBHOOK_SECRET`
- **Events:** *Issues* and *Issue comments*

## 7. Configure Codex CLI

```env
CODEX_BIN=codex
```
The agent invokes (conceptually): `codex exec --sandbox workspace-write "<prompt>"`.
If `codex` isn't on `PATH`, the worker falls back to a clearly-labelled **mock**.

## 8. Configure Claude Code CLI

```env
CLAUDE_BIN=claude
```
The agent invokes (conceptually): `claude -p "<prompt>"`.
If `claude` isn't on `PATH`, the worker falls back to a **mock**.

> See `TODO(codex)` / `TODO(claude)` in the worker files to confirm exact flags
> for your installed CLI versions.

## 9. Configure Gemini for the agent

```env
AGENT_MODEL=gemini-3.5-flash
GEMINI_API_KEY=your_google_ai_studio_key
DEFAULT_WORKER=claude
# Optional: include e2e/playwright scripts after normal checks.
RUN_BROWSER_CHECKS=1
```

Gemini is used only for the Eve agent/orchestrator. It decides what tools to
call and manages the workflow. The code-changing workers remain Codex/Claude,
so `/fix gemini` is intentionally not supported.

## 10. Run the agent

- **Eve runtime:** `npm run dev`
- **Standalone webhook:** `npm run webhook`
- **Local CLI (no webhook needed):**

```bash
# Force mocks so you can try the flow with no worker configured:
WORKER_MOCK=1 npm run cli -- repro --issue 123 --owner acme --repo widgets
npm run cli -- fix     --issue 123 --worker claude
npm run cli -- compare --issue 123
npm run cli -- stop    --issue 123
```

(`--owner/--repo` default to `GITHUB_OWNER`/`GITHUB_REPO`.)

> Eve's interactive TUI has its own built-in `/help` slash menu (`/new`, `/model`,
> `/deploy`, etc.). The `/repro`, `/fix`, and `/compare` commands in this repo
> are GitHub/Linear issue-comment commands plus local CLI verbs; they are not
> registered as Eve TUI slash commands.

## 11. Try `/repro`

1. Create an issue (example below), then comment `/repro`.
2. The agent prepares `.runs/issue-<n>/`, runs the worker, writes `report.md`,
   and posts the report. It then waits for approval.

<details><summary>Example test issue</summary>

```md
# Clients disappear after clearing filters

## Steps to reproduce
1. Open `/clients`
2. Apply the status filter `active`
3. Switch layout from grid to list
4. Clear filters

## Expected
All clients should be visible again.

## Actual
Some clients remain hidden until refreshing the page.
```
</details>

## 12. Try `/fix` and `/compare`

- Comment `/fix` (or `/fix codex` / `/fix claude`). The agent creates
  `agent/fix-issue-<n>`, runs the fix worker, runs checks, and opens a PR **only
  if checks pass**. If they fail, it comments the failure and opens no PR.
- Comment `/compare` to get a Codex-vs-Claude diagnosis table.

---

## 13. Eve API confidence (important)

Per the project's "don't invent Eve APIs" rule, here's exactly what's grounded:

| Area | Confidence | Notes |
|---|---|---|
| `defineAgent` (`eve`) | ✅ confirmed | docs + concepts |
| `defineTool` (`eve/tools`, zod `inputSchema`, filename = tool name) | ✅ confirmed | docs + concepts |
| Filesystem layout (`agent/tools`, `skills`, `channels`, `connections`, `subagents`, `schedules`, `sandbox`) | ✅ confirmed | concepts |
| Sessions/durability/sandbox model | ✅ confirmed | concepts |
| GitHub **channel** | ✅ confirmed | custom `defineChannel` wrapper at [agent/channels/github.ts](agent/channels/github.ts), reusing the PAT-based webhook core |
| **connections** API | ✅ confirmed | Eve supports MCP/OpenAPI connections; this MVP does not need one because GitHub auth lives in `src/github` via `GITHUB_TOKEN` |
| `defineSchedule` | ✅ confirmed | [agent/schedules/sweep-stale-runs.ts](agent/schedules/sweep-stale-runs.ts) uses `defineSchedule` |
| **subagents** config | ✅ confirmed | each subagent has `agent.ts` plus role instructions |
| **approvals** API | ⚠️ partial | approval is enforced in our workflow (a human `/fix` comment is the gate); Eve's native approval primitive isn't wired |

**Design choice:** all product logic lives in a framework-agnostic `src/` core.
The Eve `agent/tools/*` files are thin `defineTool` wrappers over `src/`, so the
MVP runs today via the webhook/CLI **and** plugs into Eve using only confirmed
APIs. `npm run typecheck`, `npx eve info`, and `npm run build` should pass
after dependencies are installed.

> The **webhook intake** (`npm run webhook`) and the Eve channel route both
> drive the identical core workflow.

## 14. Limitations

- Reproduction quality depends on the worker CLI; mocks are for plumbing only.
- Gemini is not a worker in this repo; it only drives the Eve agent runtime.
- Cloning/checks need network and may be slow for large repos (shallow clone used).
- `e2e`/`playwright` checks are opt-in with `RUN_BROWSER_CHECKS=1`
  because they can be slow and need installed browsers.
- Single-repo focus per issue; monorepo targeting is naive.

## 15. Security

- ✅ Human approval required before any code change / branch / PR.
- ✅ Never auto-merges, never deploys.
- ✅ `safe-exec` refuses `rm -rf`, `git push --force`, prod migrations, pipe-to-shell, etc.
- ✅ Strips sensitive env vars from worker subprocesses.
- ✅ Redacts secrets (`*_TOKEN`, `*_KEY`, `DATABASE_URL`, `Bearer …`, PEM keys,
  URL basic-auth) from all logs/comments — see [src/utils/redact-secrets.ts](src/utils/redact-secrets.ts).
- ✅ Worker timeouts and log-size caps on everything posted publicly.
- ✅ Loads `.env` only for process configuration; strips secrets before worker subprocesses.
- ✅ Workers run in **separate** working directories (Codex ≠ Claude).

## 16. Roadmap

1. Replace the PAT path with GitHub App auth when moving beyond the MVP.
2. Real Codex/Claude CLI flag tuning + structured (`--output-format json`) parsing.
3. Wire Eve native approvals if/when you want approval prompts beyond `/fix`.
4. Implement the Linear adapter (`LinearIssueProvider`) + Linear intake.
5. Move run state from `.runs/` files to a database; add evals/tracing dashboards.
6. Richer Playwright artifact capture for browser repros; better environment provisioning.

---

## Project structure

```
agent/                      # Eve agent (filesystem-first)
  agent.ts                  # defineAgent (model)
  instructions.md           # orchestrator system prompt + safety rules
  tools/*.ts                # 9 defineTool wrappers over src/ core
  skills/*.md               # triage, repro-report, fix-policy, stack debugging
  subagents/*/              # triage/repro/fix/test/report roles
  channels/github.ts        # GitHub webhook intake for Eve
  schedules/sweep-stale-runs.ts  # stale-approval sweep

src/                        # framework-agnostic core (fully tested)
  providers/                # IssueProvider + GitHub (real) + Linear (stub) + bug parser
  workers/                  # codex/claude/mock workers + dispatch + prompts
  workflow/                 # state machine, run-store, prepare-workdir, checks, orchestrator
  reports/                  # reproduction + compare report renderers
  github/                   # REST client, webhook, PR/git helpers
  utils/                    # safe-exec, redact-secrets, command-parser, package-manager, …
  app.ts / server.ts / cli.ts   # composition root, webhook server, local CLI

tests/                      # vitest: parser, package-manager, redaction, report, integration
```

Run the tests:

```bash
npm test
```
