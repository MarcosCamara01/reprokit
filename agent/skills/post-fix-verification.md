---
description: >-
  Use after a worker reports a fix to verify that the original bug no longer
  reproduces, checks passed for the right reason, and the PR is safe to open.
---

# Post-Fix Verification

Passing checks is necessary but not enough. Confirm the original reported bug is
gone using the same evidence path that reproduced it.

## Verification Order

1. Inspect changed files for scope: no unrelated cleanup, generated files, env
   files, or broad refactors.
2. Run the focused regression test or original repro command.
3. Run project checks in orchestrator order.
4. Re-run browser/e2e evidence when the bug was UI/browser-specific and browser
   checks are enabled.
5. Summarize remaining risk.

## Confirm Fixed

Report fixed only when:

- The original symptom no longer appears.
- The reproduction path is the same or stricter than the pre-fix path.
- The fix can be explained by the root cause.
- Project checks are green or a human has accepted a clearly documented
  limitation.

## Stop Conditions

- The bug still reproduces.
- The fix changes behavior outside the issue scope.
- The worker cannot explain the root cause.
- Checks fail and cannot be repaired without expanding scope.
- Verification relies only on visual inspection when a deterministic command or
  test exists.
