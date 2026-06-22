# Tasks: Agent-Browser Repro Evidence

## Status

Plan approved: 2026-06-22 (human-approved, both workers). Self-approved to run /spec-tasks per .sdd/autonomy.md (Mode: autonomous) after a human-approved plan.

---

## Rules

- One task at a time — finish it completely before moving on
- Write the test first — it must fail (red) before any implementation; implement until green; then run the full suite
- Each task touches only what's needed — no cleanup of adjacent code
- If a task reveals ambiguity, contradiction, impossibility, or new scope, STOP and run /impl-gap. If requirements or plan must change, escalate to /spec-amend before editing approved spec files.

---

## Tasks

- [x] **Task 1**: Add a `WorkerCapabilities` arg + `BROWSER_PROTOCOL` block to the prompt builders; append it only when `browser` is on.
  - Test: `tests/worker-prompts.test.ts` (consolidated into the existing prompt-test file rather than a new `tests/prompts.test.ts`, to match repo conventions) — browser:true contains agent-browser guidance + the `"screenshots"` instruction; no-caps == browser:false and contains no "agent-browser". Was red before the arg existed.
  - Changes: `src/workers/prompts.ts` — added `WorkerCapabilities`, `BROWSER_PROTOCOL`, `browserSection()`, optional `caps` on `buildReproPrompt`/`buildFixPrompt`, conditional insertion keeping the off-path byte-identical. `REPRO_RESULT_SCHEMA` left untouched (the `"screenshots"` field is requested in the browser block, not the shared schema).
  - Goal: G1, G4
  - Criterion: "Scenario: repro prompt includes the browser protocol when the browser capability is on" + "Scenario: repro prompt is unchanged when the browser capability is off"

- [x] **Task 2**: Thread `browser`/`env` from the worker input into the prompt builder and `safeExec`.
  - Test: plumbing — verified by `tsc --noEmit` (green) plus Task 1's behavioral coverage of the builder. No bespoke worker→safeExec runtime test (would require mocking the external CLI; out of step with repo conventions). Was red at typecheck before the input fields existed.
  - Changes: `src/types.ts` — `browser?`/`env?` on `ReproWorkerInput`. `src/workers/claude-worker.ts` + `src/workers/codex-worker.ts` — pass `{ browser: input.browser }` to `buildReproPrompt` and `env: input.env` to the repro `safeExec`.
  - Goal: G1, G5
  - Criterion: supports "Scenario: repro prompt includes the browser protocol …" through the real worker path

- [x] **Task 3**: Parse `screenshots` from worker JSON into the typed result.
  - Test: `tests/coding-worker.test.ts` (new — no prior coding-worker test existed) — maps a screenshots array; defaults to `[]` for `{}` and `null`. Was red before the field existed.
  - Changes: `src/types.ts` — `screenshots?: string[]` on `ReproWorkerResult`. `src/workers/coding-worker.ts` — `screenshots: asStringArray(j.screenshots)` in `coerceReproResult`.
  - Goal: G2
  - Criterion: "Scenario: worker result carries browser screenshot paths"

- [x] **Task 4**: Render captured screenshots in the reproduction report.
  - Test: `tests/reproduction-report.test.ts` — present screenshots are listed under "### Screenshots"; empty/absent keeps "_None captured in this run._". Was red before the render change.
  - Changes: `src/reports/reproduction-report.ts` — hardcoded "_None captured_" line replaced with `bullets(r.screenshots ?? [], "_None captured in this run._")`.
  - Goal: G2
  - Criterion: "Scenario: reproduction report renders captured browser evidence"

- [x] **Task 5**: Wire the workflow to enable the browser capability for `needsBrowser` issues.
  - Test: the gate decision is a pure helper (`browserFieldsFor`) tested in `tests/browser-env.test.ts` (true → `browser:true` + constrained env; false → `{}`). The three-call-site spread is verified by `tsc --noEmit` + the full suite staying green (existing workflow-integration tests unchanged). Chose the pure-helper seam over mocking `getWorker` to stay in repo style.
  - Changes: `src/workflow/issue-workflow.ts` — `...browserFieldsFor(issue, key)` spread into the `/repro`, pre-fix, and post-fix `runRepro` inputs.
  - Goal: G1, G3
  - Criterion: "Scenario: the browser environment passed to a browser-enabled worker is constrained" (workflow side)

- [x] **Task 6**: Add `buildBrowserEnv(runKey)` + `browserFieldsFor(issue, runKey)` producing/gating the constrained browser env.
  - Test: `tests/browser-env.test.ts` (new) — headless `"0"`, per-run `AGENT_BROWSER_SESSION`, `AGENT_BROWSER_ALLOWED_DOMAINS` includes `localhost`/`127.0.0.1` and excludes public hosts; distinct runs get distinct sessions. Was red before the file existed.
  - Changes: `src/workflow/browser-env.ts` (new) — `buildBrowserEnv(runKey)` and the `browserFieldsFor` gate (added alongside to keep the workflow diff to a single spread call; this fulfils the plan's `browser-env.ts` New row).
  - Goal: G5
  - Criterion: "Scenario: the browser environment passed to a browser-enabled worker is constrained" (helper side)

---

## Completion

- [x] All tasks done (code complete, full suite green: 80/80)
- [x] Every acceptance scenario in 1-requirements.md covered by a passing test
- [x] /verify completed (`verify-report.md`, Result: PASS — 7/7 checks)
- [x] /review completed with `review-report.md` (Result: FOLLOW_UPS — 3 non-blocking)
- [ ] /finish — STOPPED for human commit approval (per .sdd/autonomy.md; commit not delegated)
- [ ] Spec moved to `specs/_done/agent-browser-repro/` (human action, after merge)

> CR-001 (test-file path reconciliation) was approved 2026-06-22 and applied to `2-plan.md`,
> clearing the only `/verify` blocker.
