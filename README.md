# Issue Repro & Fix Agent (`reprokit`)

> **Turns vague bug reports into reproducible evidence and safe fix PRs.**
> _Convierte issues vagos en bugs reproducibles, informes claros y PRs seguros con aprobación humana._

Built on [**Vercel Eve**](https://vercel.com/docs/eve) — a filesystem-first
framework for durable backend AI agents. Eve acts as the **orchestrator**;
**Codex** and **Claude Code** run as **external workers** in isolated checkouts.

---

## 1. What this is

A GitHub-issue agent that reacts to slash-commands in issue comments:

| Command | Action |
|---|---|
| `/repro` | Reproduce the bug in an isolated checkout and post a reproduction report |
| `/fix` | Fix with the default worker (**only after you approve**) |
| `/fix codex` / `/fix claude` | Fix with a specific worker |
| `/compare` | Run both workers read-only and compare diagnoses |
| `/stop` | Stop work on the issue |

The core flow:

```
GitHub issue → /repro → worker → reproduction report → human approval → /fix → checks → PR
```

## 2. What the MVP does

- ✅ Reads a GitHub issue (title, body, labels, comments, repo).
- ✅ Triages it and asks for more info when it's too thin.
- ✅ Clones the repo into an isolated `.runs/issue-<n>/repo` checkout.
- ✅ Runs a reproduction worker (Codex/Claude **or a mock** if the CLI is absent).
- ✅ Generates `report.md` and posts it on the issue.
- ✅ **Waits for human approval** before any code change.
- ✅ On `/fix`: runs a fix worker, runs project checks, and — only if they pass —
  pushes `agent/fix-issue-<n>` and opens a PR (never auto-merged).
- ✅ `/compare`: runs both workers in **separate** checkouts and posts a table.
- ✅ Redacts secrets and refuses destructive commands.

## 3. What it does NOT do yet

- ❌ Linear is a **stub** (clean adapter, not implemented) — see [src/providers/linear-provider.ts](src/providers/linear-provider.ts).
- ❌ No GitHub App (uses a personal access token; App is designed-for, not required).
- ❌ No auto-merge, no deploy, no production DB/secrets.
- ❌ No dashboard/UI; state is files under `.runs/`.
- ⚠️ Some Eve features (channel/connection/schedule wiring) are **TODO-flagged**
  because their exact API isn't in the public docs yet — see §12.

---

## 4. Installation

```bash
# 1. Install dependencies (this fetches Eve + zod + dev tools)
npm install

# 2. After install, read Eve's real local docs to confirm beta APIs:
ls node_modules/eve/dist/docs/public/

# 3. Configure environment
cp .env.example .env   # then edit .env
```

> **Note:** `npm run typecheck` only fully passes after `npm install` (the
> `agent/` files import `eve`). `npm test` works immediately — tests only depend
> on `src/`.

## 5. Configure Eve

`agent/agent.ts` selects the model via [AI Gateway](https://vercel.com/docs/ai-gateway):

```ts
export default defineAgent({ model: "anthropic/claude-sonnet-4.6" });
```

Run the Eve dev server (intake via the GitHub channel — see §12):

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

## 9. Run the agent

- **Eve runtime:** `npm run dev`
- **Standalone webhook:** `npm run webhook`
- **Local CLI (no webhook needed):**

```bash
# Force mocks so you can try the flow with no Codex/Claude installed:
WORKER_MOCK=1 npm run cli -- repro --issue 123 --owner acme --repo widgets
npm run cli -- fix     --issue 123 --worker claude
npm run cli -- compare --issue 123
npm run cli -- stop    --issue 123
```

(`--owner/--repo` default to `GITHUB_OWNER`/`GITHUB_REPO`.)

## 10. Try `/repro`

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

## 11. Try `/fix` and `/compare`

- Comment `/fix` (or `/fix codex` / `/fix claude`). The agent creates
  `agent/fix-issue-<n>`, runs the fix worker, runs checks, and opens a PR **only
  if checks pass**. If they fail, it comments the failure and opens no PR.
- Comment `/compare` to get a Codex-vs-Claude diagnosis table.

---

## 12. Eve API confidence (important)

Per the project's "don't invent Eve APIs" rule, here's exactly what's grounded:

| Area | Confidence | Notes |
|---|---|---|
| `defineAgent` (`eve`) | ✅ confirmed | docs + concepts |
| `defineTool` (`eve/tools`, zod `inputSchema`, filename = tool name) | ✅ confirmed | docs + concepts |
| Filesystem layout (`agent/tools`, `skills`, `channels`, `connections`, `subagents`, `schedules`, `sandbox`) | ✅ confirmed | concepts |
| Sessions/durability/sandbox model | ✅ confirmed | concepts |
| GitHub **channel** signature | ⚠️ partial | GitHub is a listed built-in channel; exact import/options not public. Mirrors the official Slack template; **TODO(eve)** in [agent/channels/github.ts](agent/channels/github.ts) |
| **connections** API | ⚠️ low | documented concept; concrete `defineConnection`/Connect shape not public. Real auth lives in `src/github`; **TODO(eve)** in [agent/connections/github.ts](agent/connections/github.ts) |
| `defineSchedule` | ⚠️ partial | named in the announcement; exact shape not public. **TODO(eve)** in [agent/schedules/sweep-stale-runs.ts](agent/schedules/sweep-stale-runs.ts) |
| **subagents** config | ⚠️ partial | dir convention documented; per-subagent config not public. See [agent/subagents/README.md](agent/subagents/README.md) |
| **approvals** API | ⚠️ partial | approval is enforced in our workflow (a human `/fix` comment is the gate); Eve's native approval primitive isn't wired |

**Design choice:** all product logic lives in a framework-agnostic `src/` core.
The Eve `agent/tools/*` files are thin `defineTool` wrappers over `src/`, so the
MVP runs today via the webhook/CLI **and** plugs into Eve using only confirmed
APIs. After `npm install`, confirm the ⚠️ items against
`node_modules/eve/dist/docs/public/` and uncomment the wiring in those files.

> If `eve dev` complains about a placeholder channel/connection/schedule file,
> wire it per the local docs or temporarily remove it — the **webhook intake
> (`npm run webhook`) works regardless** and drives the identical core.

## 13. Limitations

- Reproduction quality depends on the worker CLI; mocks are for plumbing only.
- Cloning/checks need network and may be slow for large repos (shallow clone used).
- `e2e`/`playwright` checks are **skipped by default** (slow, need browsers).
- Single-repo focus per issue; monorepo targeting is naive.

## 14. Security

- ✅ Human approval required before any code change / branch / PR.
- ✅ Never auto-merges, never deploys.
- ✅ `safe-exec` refuses `rm -rf`, `git push --force`, prod migrations, pipe-to-shell, etc.
- ✅ Strips sensitive env vars from worker subprocesses.
- ✅ Redacts secrets (`*_TOKEN`, `*_KEY`, `DATABASE_URL`, `Bearer …`, PEM keys,
  URL basic-auth) from all logs/comments — see [src/utils/redact-secrets.ts](src/utils/redact-secrets.ts).
- ✅ Worker timeouts and log-size caps on everything posted publicly.
- ✅ Never reads/edits `.env*` or key files; never uses production secrets/DB.
- ✅ Workers run in **separate** working directories (Codex ≠ Claude).

## 15. Roadmap

1. Confirm & wire the Eve GitHub channel, connections, schedules, subagents,
   and native approvals against the installed docs.
2. Real Codex/Claude CLI flag tuning + structured (`--output-format json`) parsing.
3. GitHub App auth (installation tokens) replacing the PAT.
4. Implement the Linear adapter (`LinearIssueProvider`) + Linear intake.
5. Move run state from `.runs/` files to a database; add evals/tracing dashboards.
6. Screenshot capture for browser-repro bugs; richer environment provisioning.

---

## Project structure

```
agent/                      # Eve agent (filesystem-first)
  agent.ts                  # defineAgent (model)
  instructions.md           # orchestrator system prompt + safety rules
  tools/*.ts                # 9 defineTool wrappers over src/ core
  skills/*.md               # triage, repro-report, fix-policy, stack debugging
  subagents/*/              # triage/repro/fix/test/report roles (instructions)
  channels/github.ts        # GitHub intake (TODO(eve): confirm signature)
  connections/github.ts     # GitHub auth config (TODO(eve))
  schedules/sweep-stale-runs.ts  # stale-approval sweep (TODO(eve))

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
