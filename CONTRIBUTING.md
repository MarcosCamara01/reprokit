# Contributing

Thanks for helping improve `reprokit`.

`reprokit` is an issue-driven agent that can read GitHub issues, run coding
workers, execute project checks, comment on issues, and open pull requests. That
means contributions should keep safety, clarity, and debuggability front and
center.

## Development Setup

```bash
git clone https://github.com/MarcosCamara01/reprokit.git
cd reprokit
npm install
cp .env.example .env
```

Fill in only the environment variables you need for the flow you are testing.
Never commit `.env` or real secrets.

## Useful Commands

```bash
npm run typecheck
npm test
npm run webhook
```

For local plumbing tests without real Codex or Claude CLI runs:

```bash
WORKER_MOCK=1 npm run cli -- repro --issue 123 --owner acme --repo widgets
WORKER_MOCK=1 npm run cli -- fix --issue 123 --owner acme --repo widgets
WORKER_MOCK=1 npm run cli -- compare --issue 123 --owner acme --repo widgets
```

## Pull Request Guidelines

- Keep changes focused and easy to review.
- Add or update tests for workflow, parser, report, redaction, or safety changes.
- Do not include real tokens, webhook payload secrets, private keys, or `.env`
  contents in commits, tests, screenshots, logs, or issue comments.
- Avoid broad refactors when fixing a small bug.
- Run `npm run typecheck` and `npm test` before opening a PR.
- Document new environment variables in both `.env.example` and `README.md`.

## Testing Expectations

Core changes should include tests when practical. The most important areas are:

- command parsing
- secret redaction
- GitHub webhook parsing
- package manager/script detection
- workflow state transitions
- report rendering
- safe command execution

If a change is difficult to test directly, include a short explanation in the PR
describing how it was verified manually.

## Documentation

User-facing behavior should be documented in `README.md`. Deployment notes live
in `docs/`.

When documenting setup, prefer placeholders over examples that look like real
secrets.

