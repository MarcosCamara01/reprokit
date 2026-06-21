---
description: >-
  Use whenever /fix has been approved and the agent or worker is about to
  change code, choose fix scope, run checks, create a branch, or decide whether
  a PR can be opened.
---

# Fix Policy

Apply fixes only after a human approval signal: `/fix`, `/fix codex`, or
`/fix claude`. The fix must be the smallest safe change that resolves the
reproduced bug.

## Preconditions

- A reproduction report exists, or the `/fix` flow has just run a pre-fix
  reproduction successfully.
- The bug is reproduced or there is concrete evidence such as a failing test,
  failing command, or deterministic stack trace.
- The target checkout is isolated for this worker and issue.
- The requested work is a bug fix, not a feature or refactor.

If any precondition is missing, stop and report what is missing.

## Fix Rules

- Preserve existing architecture, style, formatting, and public contracts.
- Touch only files that directly participate in the bug.
- Prefer fixing the root cause over masking the symptom.
- Add or update a focused test when the repo has a relevant test surface.
- Remove only unused code created by the fix itself.
- Never edit secrets, environment files, generated artifacts, or unrelated
  cleanup.

## Verification Gates

Before a PR can be opened:

1. The worker returns `fixed: true`.
2. Project checks pass in order: typecheck, lint, test, build, and detected
   Playwright/e2e checks when browser checks are enabled.
3. Post-fix verification confirms the original bug no longer reproduces.

If any gate fails, post the failure with redacted, truncated logs and do not
open a PR.

## PR Conventions

- Branch: `agent/fix-issue-<n>`.
- Commit: `fix: resolve issue #<n>`.
- PR title: `fix: <issue title>`.
- PR body: `Closes #<n>`, bug summary, repro steps, fix summary, checks run,
  and risks.

Never auto-merge. Never deploy.
