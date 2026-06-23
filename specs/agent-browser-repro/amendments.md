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

## CR-002 — 2026-06-23

- **Trigger:** review-finding (senior-dev review of the merged feature; user-directed
  remediation). The post-merge review found the agent-browser capability was wired only
  into the standalone workflow (`src/workflow/issue-workflow.ts`), leaving two
  inconsistencies the original plan did not cover, plus undocumented surfaces.
- **Motive:**
  1. The Eve agent surface (`agent/tools/run_repro_worker.ts`) never passed
     `browserFieldsFor`, so `npm run dev` silently lacked browser evidence for
     `needsBrowser` bugs while the webhook/CLI surface had it — a divergence between the
     two runtime surfaces.
  2. `buildFixPrompt` carried a `caps`/browser parameter (per the original plan, line 89)
     that no caller ever set: `FixWorkerInput` has no `browser`/`env` fields and the fix
     worker is not granted the browser. G3 scopes browser evidence to reproduction +
     post-fix verification, and post-fix verification runs through `runRepro` (already
     wired) — so the parameter was dead code promising an absent capability.
  3. The capability was undocumented outside this spec: `agent/instructions.md` and the
     repro subagent still pointed only to Playwright, and the optional external dependency
     (`agent-browser` + Chromium) was recorded nowhere in README / `.env.example` /
     `Dockerfile` / deployment notes.
- **Change in requirements:** add **G6** — the fix worker is browser-capable for
  `needsBrowser` bugs (debug + self-verify before reporting `fixed: true`), in addition to
  the orchestrator's independent post-fix verification (G3). Applied to `1-requirements.md`.
- **Change in plan (`2-plan.md` Components Affected):**
  - `src/types.ts` — add `browser?`/`env?` to `FixWorkerInput`; add `screenshots?` to
    `FixWorkerResult`.
  - `src/workers/prompts.ts` — add `BROWSER_PROTOCOL_FIX`; `buildFixPrompt` gains the
    capabilities arg and appends the fix-phase browser block when browser is on.
  - `src/workers/coding-worker.ts` — `coerceFixResult` reads `screenshots` (defaults `[]`).
  - `src/workers/claude-worker.ts`, `src/workers/codex-worker.ts` — `runFix` passes the
    capability to the prompt and `env: input.env` to `safeExec`.
  - `src/workflow/issue-workflow.ts` — spread `browserFieldsFor` into the `runFix` call;
    render captured screenshots in both the Fix Report and the Post-Fix Verification
    Report (the latter was capturing screenshots via the post-fix repro but never
    rendering them).
  - `agent/tools/run_repro_worker.ts`, `agent/tools/run_fix_worker.ts` — spread
    `browserFieldsFor` so the Eve agent surface reaches parity with the standalone workflow.
- **Docs synced (no behavior change):** `agent/instructions.md`,
  `agent/subagents/repro-agent/instructions.md`, `README.md`, `.env.example`,
  `Dockerfile` (comment), `docs/cloud-deployment-notes.md` — document `agent-browser` as
  the in-loop tool (repro + fix) and the optional external runtime dependency.
- **Tests:** `tests/worker-prompts.test.ts` (fix prompt carries the browser block + the
  after-fix marker when on, byte-identical when off); `tests/coding-worker.test.ts`
  (`coerceFixResult` screenshots, defaulting to `[]`).
- **Out of scope / follow-ups (not in this CR):** installing `agent-browser`/Chromium in
  the runtime image (ops task, per plan Non-Goal); orchestrator robustness
  (state-transition enforcement, comment-post resilience, `.runs` GC) and a
  worker-injection test seam for the `/fix` gate branches — tracked separately.
- **Status:** Approved 2026-06-23 (human-directed: the product owner instructed
  implementation of the review remediation plan and clarified that the fix worker itself
  must use agent-browser to verify its change). Commit remains a human hard-stop per
  `.sdd/autonomy.md`.
