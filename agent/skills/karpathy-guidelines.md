---
description: >-
  Use whenever a worker is about to implement, review, or modify a bug fix and
  needs guardrails against common LLM coding mistakes: hidden assumptions,
  overengineering, broad refactors, speculative changes, or weak verification.
---

# Karpathy Guidelines

Use these guardrails to keep fixes evidence-led and small.

## Before Editing

- State the assumption behind the fix in one sentence.
- Name the simplest viable fix.
- Name what would make that fix wrong.
- Confirm the success criterion: failing test passes, repro no longer fails, or
  exact command becomes green.

## While Editing

- Change the minimum code necessary to address the reproduced root cause.
- Match local style even if another style is preferable.
- Avoid new abstractions for one bug.
- Avoid speculative flexibility, broad error handling, or unrelated cleanup.
- Do not remove pre-existing dead code unless it blocks the fix.

## Before Reporting Success

- Re-run the focused repro or test first.
- Run the project checks requested by the orchestrator.
- Confirm no unrelated files changed.
- Report residual risk plainly when evidence is incomplete.

## Red Flags

- The fix cannot be tied to a reproduced failure.
- The patch mostly renames, reformats, or reorganizes code.
- The change is larger than the bug explanation.
- Verification says only "looks good" or "tests pass" without naming the test,
  command, or repro.
