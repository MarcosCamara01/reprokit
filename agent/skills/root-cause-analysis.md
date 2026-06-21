---
description: >-
  Use when moving from a reproduced symptom to a suspected root cause, comparing
  hypotheses, deciding suspected files, or preventing a fix that only masks the
  observed failure.
---

# Root Cause Analysis

Find the smallest causal explanation that predicts the observed failure.

## Process

1. Restate the symptom as observed evidence, not interpretation.
2. List two or three plausible hypotheses.
3. For each hypothesis, identify the file, state transition, command, or log
   line that would confirm or falsify it.
4. Prefer the hypothesis that explains all evidence with the fewest assumptions.
5. State the root cause in one sentence before proposing a fix.

## Good Root Cause Shape

Use this form:

`<condition/input> causes <code path/state> to <wrong behavior> because <specific reason>.`

Example:

`Clearing filters leaves page=3 intact, so the list asks for a page beyond the
new result set because filter reset does not reset pagination.`

## Falsification Checks

- Can the bug be reproduced without this suspected file?
- Would the same bug happen with different input?
- Does the hypothesis explain logs, screenshots, and test output?
- Is there a smaller upstream cause?

## Anti-Patterns

- Do not call a stack trace line the root cause without explaining why that
  code received bad state.
- Do not fix every plausible cause.
- Do not skip diagnosis because the fix seems obvious.
