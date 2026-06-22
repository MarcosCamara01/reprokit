# Change Requests — Agent-Browser Repro Evidence

## CR-001 — 2026-06-22

- **Trigger:** review-finding (self-detected during /spec-tasks)
- **Motive:** The approved plan's "Components Affected" listed test files that did not match
  the repo's existing test layout. `tests/prompts.test.ts` was planned as New, but a
  prompt-builder test file (`tests/worker-prompts.test.ts`) already existed — adding a
  second file testing `src/workers/prompts.ts` duplicates coverage and violates repo
  conventions. Likewise `tests/reproduction-report.test.ts` already existed (the plan
  wrongly marked it New). The cleaner choice was to consolidate into the existing files,
  but that means a test file (`tests/worker-prompts.test.ts`) was modified that the plan
  did not list, which fails `/verify` check 5 unless the plan is reconciled.
- **Change in requirements:** none. Goals, scenarios, and constraints are unchanged.
- **Change in plan:** update the "Components Affected" test rows in `2-plan.md`:
  - Remove `tests/prompts.test.ts` (New).
  - Add `tests/worker-prompts.test.ts` (Modified) — browser-capability cases for the prompt builders.
  - Change `tests/reproduction-report.test.ts` from New to Modified.
  - Keep `tests/coding-worker.test.ts` (New) and `tests/browser-env.test.ts` (New) as-is.
  No production-code rows change. No behavior changes.
- **Affected tasks:** Task 1 (test home is `worker-prompts.test.ts`), Task 4 (test home is the
  existing `reproduction-report.test.ts`). Both are already implemented and green; only their
  recorded test-file paths change.
- **Status:** Approved 2026-06-22 (human-approved via approval prompt). Applied to `2-plan.md` Components Affected + New Artifacts.
