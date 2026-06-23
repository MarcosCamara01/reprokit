# Reprokit cloud deployment notes

Notes to resume later when moving `reprokit` from a local machine/tunnel to a
cloud server.

## Recommended target

Use a small VPS instead of serverless. `reprokit` needs a long-running process,
persistent disk, Git, Node, worker CLIs, and enough resources to clone repos and
run checks.

Best low-cost option:

- Provider: Hetzner Cloud
- Region: Germany or Finland
- Plan: CX33
- Size: 4 vCPU, 8 GB RAM, 80 GB disk
- Why: cheap x86 VPS with enough margin for `/repro`, `/fix`, TypeScript checks,
  tests, and Codex/Claude CLI.

Cheaper test option:

- Hetzner CX23
- 2 vCPU, 4 GB RAM, 40 GB disk
- Good for testing, but may be tight for heavier `/fix` runs.

Free/ultra-cheap option:

- Oracle Cloud Always Free
- Possible cost: 0 EUR
- Tradeoff: more setup friction, ARM compatibility concerns, and availability
  can be annoying. Try only if saving every euro matters more than simplicity.

Avoid for this project:

- Render Free or similar free web services
- Reason: services can sleep, filesystem can be ephemeral, and `reprokit` needs
  persistent `.runs/` data plus long-running commands.

## Why RAM and disk matter

`reprokit` is heavier than a normal webhook because `/repro` and `/fix` can:

- Clone the repo into `.runs/issue-<n>/repo`
- Install or inspect dependencies
- Run tests, typecheck, lint, build, and optional browser checks
- Launch Codex or Claude CLI
- Keep logs, reports, run state, and temporary branches
- Store several issue runs at the same time

Minimum to try:

- 2 vCPU
- 4 GB RAM
- 40 GB disk

Better for regular use:

- 4 vCPU
- 8 GB RAM
- 80 GB disk

## Target architecture

```txt
GitHub webhook
  -> https://reprokit.example.com/webhook
  -> Caddy or Nginx HTTPS reverse proxy
  -> localhost:3001
  -> npm run webhook
  -> .runs/, GitHub comments, branches, PRs
```

## Server requirements

- Ubuntu VPS
- Node 24+
- npm
- git
- Caddy or Nginx
- Codex CLI and/or Claude CLI installed and authenticated
- Optional, for in-loop UI-bug evidence: the `agent-browser` CLI + a Chromium/Chrome
  binary on PATH. Without them, `needsBrowser` bugs degrade cleanly (no screenshots).
- Repo cloned to something like `/opt/reprokit`
- Persistent `.runs/` directory

## Required environment variables

Do not commit real secrets. Configure these on the server:

```env
GITHUB_TOKEN=
GITHUB_OWNER=MarcosCamara01
GITHUB_REPO=reprokit
GITHUB_WEBHOOK_SECRET=
GEMINI_API_KEY=
AGENT_MODEL=gemini-3.5-flash
DEFAULT_WORKER=codex
CODEX_BIN=codex
CLAUDE_BIN=claude
PORT=3001
```

Optional:

```env
RUN_BROWSER_CHECKS=1
WORKER_TIMEOUT_MS=900000
MAX_LOG_CHARS=12000
```

## Deployment steps to do later

1. Create the VPS.
2. Point a subdomain to the VPS IP, for example `reprokit.example.com`.
3. Install Node 24+, npm, git, and Caddy.
4. Clone this repo into `/opt/reprokit`.
5. Create the production `.env` on the server.
6. Run `npm install`.
7. Install and authenticate Codex CLI or Claude CLI on the server.
8. Start `npm run webhook` as a `systemd` service.
9. Configure Caddy to proxy HTTPS to `127.0.0.1:3001`.
10. Change the GitHub webhook payload URL to
    `https://reprokit.example.com/webhook`.
11. Keep GitHub webhook content type as `application/json`.
12. Subscribe to `Issues` and `Issue comments` events.
13. Use the same `GITHUB_WEBHOOK_SECRET` in GitHub and on the server.
14. Test by creating an issue and commenting `/repro` or `/fix`.

## Docker compose option

The repository includes a `Dockerfile` and `docker-compose.yml` for running the
standalone webhook in a container.

```bash
cp .env.example .env
# edit .env first
docker compose up --build
```

The compose service:

- builds the local image from `Dockerfile`
- reads runtime configuration from `.env`
- exposes `3001:3001`
- stores `.runs/` in the `reprokit_runs` named volume
- includes a health check against `/health`

The base image includes Node 24 and Git. Codex CLI and Claude Code CLI are not
installed in the default image; install them in a custom image or use
`WORKER_MOCK=1` for plumbing tests.

## Example systemd service

```ini
[Unit]
Description=Reprokit webhook
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/reprokit
ExecStart=/usr/bin/npm run webhook
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Example Caddyfile

```caddyfile
reprokit.example.com {
  reverse_proxy 127.0.0.1:3001
}
```

## Later improvement

Once the VPS deployment works, consider adding:

- persistent volume for `.runs/`
- documented deploy checklist in `README.md`
