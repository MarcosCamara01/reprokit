# Skill: Fix Policy

Applies whenever you attempt a fix (after human approval).

## Hard requirements

- A human approved via `/fix` — never fix without it.
- Smallest safe change that resolves the bug.
- Preserve existing architecture, style, and formatting.
- Add or update a test when it makes sense.
- Touch only files related to the fix.
- No secret/env file edits. No destructive commands.
- No commit/push by the worker — the orchestrator handles git.

## Gates before opening a PR

1. The fix worker reports `fixed: true`.
2. `run_project_checks` passes (typecheck → lint → test → build, plus
   e2e/playwright when `RUN_BROWSER_CHECKS=1`).

If either gate fails: post the failure with redacted, truncated logs and do
**not** open a PR.

## PR conventions

- Branch: `agent/fix-issue-<n>`.
- Commit: `fix: resolve issue #<n>`.
- PR title: `fix: <issue title>`.
- PR body: link the issue (`Closes #<n>`), bug summary, repro steps, fix
  summary, checks run, risks.
- Never auto-merge. Never deploy.
