# reprokit

Turn GitHub issues into reproducible bug reports, verified fixes, and reviewable
pull requests.

`reprokit` is an issue-driven agent for maintainers. A user writes a normal
GitHub issue, then comments with a command such as `/repro` or `/fix`. The agent
clones the repository into an isolated run directory, asks a coding worker to
reproduce or fix the bug, runs project checks, posts a detailed report back to
the issue, and opens a pull request only when the fix passes verification.

The project is built to be safe by default:

- It never auto-merges.
- It only reacts to explicit issue commands.
- It works in isolated `.runs/issue-<number>/` checkouts.
- It redacts secrets before posting logs to GitHub.
- It opens PRs for humans to review.
- It falls back to clearly labelled mock workers when Codex or Claude are not
  installed, so the workflow can still be tested.

## What It Does

`reprokit` listens to GitHub issue events and issue comments. It understands
commands anywhere in the issue body or comment text, so both of these work:

```md
/repro
```

```md
Could you please /fix this when you have a moment?
```

Supported commands:

| Command | What happens |
| --- | --- |
| `/repro` or `/reproduce` | Reproduces the bug in an isolated checkout and posts a reproduction report. |
| `/fix` | Runs the full fix pipeline with the default worker. |
| `/fix codex` | Runs the full fix pipeline with Codex CLI. |
| `/fix claude` | Runs the full fix pipeline with Claude Code CLI. |
| `/compare` | Runs Codex and Claude read-only in separate checkouts and compares their diagnoses. |
| `/stop` or `/cancel` | Marks the current workflow as stopped. |

The `/fix` pipeline is intentionally conservative:

1. Read the issue, comments, labels, and repository metadata.
2. Ask for more information if the issue is too vague.
3. Clone the repository into `.runs/issue-<number>/repo`.
4. Run a pre-fix reproduction.
5. Stop if the bug cannot be reproduced.
6. Ask the selected worker to make a fix.
7. Run project checks such as `typecheck`, `lint`, `test`, and `build`.
8. Run a post-fix reproduction to verify the bug no longer reproduces.
9. Push a branch and open a PR only after the checks and verification pass.

## How It Works

```txt
GitHub issue/comment
  -> webhook POST /webhook
  -> command parser
  -> issue workflow
  -> isolated .runs checkout
  -> Codex or Claude worker
  -> project checks
  -> GitHub issue report
  -> optional fix PR
```

There are two ways to run it:

- Standalone webhook: `npm run webhook`
- Eve runtime: `npm run dev`

The standalone webhook is the simplest path and does not require Gemini. The Eve
runtime uses Gemini through `@ai-sdk/google`, so it needs `GEMINI_API_KEY`.

## Requirements

- Node.js 24 or newer
- npm
- Git
- A GitHub repository where you can create webhooks
- A GitHub token that can read issues, comment, push branches, and open PRs
- A public HTTPS URL for GitHub webhook delivery
- Optional: Codex CLI, if you want `/fix codex`
- Optional: Claude Code CLI, if you want `/fix claude`
- Optional: Gemini API key, if you want to run the Eve runtime with `npm run dev`

For local testing, the public HTTPS URL can be a tunnel such as Cloudflare Tunnel,
ngrok, or localtunnel. For production, use a VPS or long-running service with a
stable domain.

## Installation

```bash
git clone https://github.com/YOUR_OWNER/reprokit.git
cd reprokit
npm install
cp .env.example .env
```

Then edit `.env`. Never commit `.env`.

Run local checks:

```bash
npm run typecheck
npm test
```

Start the standalone webhook:

```bash
npm run webhook
```

Health check:

```bash
curl http://127.0.0.1:3001/health
```

Expected response:

```json
{"ok":true}
```

## Environment Variables

### Required for the standalone GitHub webhook

| Variable | Required | What it is | Where to get it |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Yes | Token used to read issues, comment, push branches, and open PRs. | GitHub -> Settings -> Developer settings -> Personal access tokens. |
| `GITHUB_OWNER` | Yes for CLI, fallback for webhook | Repository owner or organization. | The `OWNER` part of `https://github.com/OWNER/REPO`. |
| `GITHUB_REPO` | Yes for CLI, fallback for webhook | Repository name. | The `REPO` part of `https://github.com/OWNER/REPO`. |
| `GITHUB_WEBHOOK_SECRET` | Yes in production | Shared secret used to verify webhook signatures. | Generate a random value locally and paste the same value into the GitHub webhook settings. |
| `PORT` | No | Local port for the standalone webhook server. | Defaults to `3001`. |

### Required only for Eve runtime

| Variable | Required | What it is | Where to get it |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes for `npm run dev` | Google AI Studio / Gemini API key used by the Eve agent model. | Google AI Studio API key page. |
| `AGENT_MODEL` | No | Gemini model name used by Eve. | Defaults to the value in `.env.example`. |

### Worker configuration

| Variable | Required | What it is |
| --- | --- | --- |
| `DEFAULT_WORKER` | No | Default worker for `/fix`; use `codex` or `claude`. |
| `CODEX_BIN` | No | Command or path for Codex CLI. Defaults to `codex`. |
| `CLAUDE_BIN` | No | Command or path for Claude Code CLI. Defaults to `claude`. |
| `WORKER_TIMEOUT_MS` | No | Timeout for a single worker run. Defaults to 15 minutes. |
| `MAX_LOG_CHARS` | No | Max log characters posted into issue comments. |
| `RUN_BROWSER_CHECKS` | No | Set to `1` to include detected `e2e` or `playwright` scripts after normal checks. |
| `WORKER_INSTALL` | No | Set to `1` if the workflow should run dependency install in the isolated checkout. |
| `WORKER_MOCK` | No | Set to `1` to force mock workers for demos and plumbing tests. |

### GitHub App variables

These are present for future GitHub App support, but the current MVP uses
`GITHUB_TOKEN`.

| Variable | Status |
| --- | --- |
| `GITHUB_APP_ID` | Not required yet. |
| `GITHUB_PRIVATE_KEY` | Not required yet. |

## How To Get Each Secret

### `GITHUB_TOKEN`

Create a GitHub personal access token.

Simplest option:

1. Go to GitHub.
2. Open `Settings`.
3. Open `Developer settings`.
4. Open `Personal access tokens`.
5. Create a token for the repository.

Classic token:

- Use the `repo` scope for private repositories.

Fine-grained token:

- Limit it to the repository you want `reprokit` to manage.
- Give it these repository permissions:
  - `Metadata`: read
  - `Contents`: read and write
  - `Issues`: read and write
  - `Pull requests`: read and write

`Contents` write is needed because `/fix` pushes a branch. `Issues` write is
needed because the agent comments on issues. `Pull requests` write is needed
because the agent opens PRs.

### `GITHUB_WEBHOOK_SECRET`

Generate a strong random string. Examples:

```bash
openssl rand -hex 32
```

Or with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the value in two places:

1. `.env` as `GITHUB_WEBHOOK_SECRET=...`
2. GitHub repository webhook settings as `Secret`

### `GEMINI_API_KEY`

Only needed for `npm run dev` with the Eve runtime. It is not required for the
standalone webhook path.

Create it in Google AI Studio, then set:

```env
GEMINI_API_KEY=your_key_here
AGENT_MODEL=gemini-3.5-flash
```

### `CODEX_BIN`

Only needed if you want real Codex worker runs.

Install and authenticate Codex CLI, then make sure this works:

```bash
codex --version
```

If the binary is somewhere else, set:

```env
CODEX_BIN=/path/to/codex
```

### `CLAUDE_BIN`

Only needed if you want real Claude worker runs.

Install and authenticate Claude Code CLI, then make sure this works:

```bash
claude --version
```

If the binary is somewhere else, set:

```env
CLAUDE_BIN=/path/to/claude
```

## GitHub Webhook Setup

In your GitHub repository:

1. Open `Settings`.
2. Open `Webhooks`.
3. Click `Add webhook`.
4. Set `Payload URL` to your public URL plus `/webhook`.
5. Set `Content type` to `application/json`.
6. Set `Secret` to the same value as `GITHUB_WEBHOOK_SECRET`.
7. Select these events:
   - `Issues`
   - `Issue comments`
8. Save the webhook.

Example payload URL:

```txt
https://reprokit.example.com/webhook
```

For local development, use a tunnel:

```txt
GitHub -> https://your-tunnel.example/webhook -> http://127.0.0.1:3001/webhook
```

## Try It Locally

You can test the plumbing without Codex or Claude by forcing mock workers:

```bash
WORKER_MOCK=1 npm run cli -- repro --issue 123 --owner acme --repo widgets
WORKER_MOCK=1 npm run cli -- fix --issue 123 --owner acme --repo widgets
WORKER_MOCK=1 npm run cli -- compare --issue 123 --owner acme --repo widgets
```

To test the real GitHub webhook:

1. Start the server:

   ```bash
   npm run webhook
   ```

2. Expose it with a public HTTPS tunnel.
3. Configure the GitHub webhook to point to the tunnel URL.
4. Create a GitHub issue.
5. Comment:

   ```md
   /repro
   ```

6. Check the issue comments and `.runs/issue-<number>/`.

For a full fix flow, comment:

```md
/fix
```

Or choose a worker:

```md
/fix codex
```

```md
/fix claude
```

## Project Checks

After a worker produces a fix, `reprokit` detects `package.json` scripts and
runs the available checks in this order:

1. `typecheck`
2. `lint`
3. `test`
4. `build`

If `RUN_BROWSER_CHECKS=1`, it also tries:

1. `e2e`
2. `playwright`

The first failing check stops PR creation. The issue gets a report explaining
which command failed, why the workflow stopped, and suggested next steps.

## Run State And Artifacts

All workflow state is file-based:

```txt
.runs/
  issue-123/
    state.json
    report.md
    fix-report.md
    verification-report.md
    repo/
```

`.runs/` is local runtime data. Do not commit it.

## Deployment

For production, use a long-running server with persistent disk.

Recommended low-cost shape:

- VPS
- Ubuntu
- Node 24+
- Git
- Caddy or Nginx for HTTPS
- `npm run webhook` managed by `systemd`, `pm2`, or Docker
- persistent `.runs/`

See [docs/cloud-deployment-notes.md](docs/cloud-deployment-notes.md) for the
deployment notes and server sizing recommendations.

Docker quick start:

```bash
cp .env.example .env
# edit .env first
docker compose up --build
```

The compose file runs the standalone webhook on `http://127.0.0.1:3001` and
stores workflow state in a persistent `reprokit_runs` volume mounted at
`/app/.runs`.

The default image includes Node 24 and Git, but it does not install Codex CLI or
Claude Code CLI. For real worker runs, extend the image with the worker CLI you
want to use; for plumbing tests, set `WORKER_MOCK=1` in `.env`.

Avoid normal serverless functions for the main worker process. `/fix` can clone
repositories, run tests, run AI coding CLIs, and take several minutes.

## Security Notes

- Never commit `.env`.
- Rotate any token that was pasted into an issue, log, screenshot, or committed
  file.
- Use a fine-grained GitHub token when possible.
- Keep token permissions as narrow as the project allows.
- Use `GITHUB_WEBHOOK_SECRET` in any public deployment.
- Do not expose the webhook without signature verification.
- Review PRs manually; the agent never auto-merges.
- Be careful with `RUN_BROWSER_CHECKS=1` on untrusted repositories because
  browser/e2e tests can execute project code.

## Current Limitations

- GitHub App authentication is designed for later, but the current MVP uses a
  personal access token.
- Linear support is stubbed in `src/providers/linear-provider.ts`.
- There is no dashboard UI; state lives in `.runs/`.
- Worker quality depends on the installed Codex or Claude CLI.
- If a worker CLI is missing, the result is a labelled mock.
- Monorepo targeting is basic.
- Browser checks are opt-in.

## Project Structure

```txt
agent/                      Eve agent wrapper and tools
src/
  app.ts                    composition root
  server.ts                 standalone webhook server
  cli.ts                    local CLI entrypoint
  github/                   GitHub REST, webhook, PR helpers
  providers/                issue providers and issue parsing
  reports/                  report rendering
  utils/                    parser, logging, safe exec, redaction
  workers/                  Codex, Claude, and mock workers
  workflow/                 orchestration, checks, run state, workdirs
tests/                      Vitest coverage for core behavior
docs/                       extra notes, including cloud deployment
```

## Useful Links

- GitHub personal access tokens:
  https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- GitHub webhook setup:
  https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks
- GitHub webhook events:
  https://docs.github.com/en/webhooks/webhook-events-and-payloads
- Gemini API keys:
  https://ai.google.dev/gemini-api/docs/api-key
- Codex CLI:
  https://developers.openai.com/codex/cli
- Claude Code:
  https://code.claude.com/docs/en/quickstart

## Contributing

Contributions are welcome. Good first areas:

- Better worker prompts
- More test coverage around workflow states
- GitHub App authentication
- Linear provider implementation
- Docker deployment files
- Cleaner reporting and artifacts
- More robust monorepo support

Before opening a PR:

```bash
npm run typecheck
npm test
```

## License

MIT. See [LICENSE](LICENSE).
