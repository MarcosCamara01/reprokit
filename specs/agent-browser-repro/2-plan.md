# Technical Plan: Agent-Browser Repro Evidence

## Status

- [x] Draft
- [x] **Approved** ← AI must not write code until this is checked

> ✅ **Human-approved on 2026-06-22** (via approval prompt): plan approved as-is for BOTH
> workers, accepting the new external dependency (`agent-browser` + browser binary in the
> execution environment). The Codex `read-only` repro-sandbox limitation remains a documented
> known risk (see Risks).

---

## Goals This Plan Addresses

- G1 ✓ — covered by Tasks 1–2 (browser protocol block + capability plumbing into the repro prompt)
- G2 ✓ — covered by Tasks 3–4 (`screenshots` on the result + report rendering)
- G3 ✓ — covered by Task 5 (capability passed through the `/fix` pre-fix and post-fix repro calls)
- G4 ✓ — covered by Task 1 (capability flag defaults off → byte-identical prompt) and its test
- G5 ✓ — covered by Task 6 (`buildBrowserEnv` + wiring into the worker `env`)

## Assumptions

Confirmed via /assume against the repo before drafting:

1. **Workers inherit env from `safeExec`.** Confirmed: [claude-worker.ts](../../src/workers/claude-worker.ts#L53)
   and [codex-worker.ts](../../src/workers/codex-worker.ts#L51) both launch via `safeExec`, and
   [safe-exec.ts](../../src/utils/safe-exec.ts#L65-L89) merges an `env` option over a sanitized base.
   If false: the env-injection task changes shape; the prompt/result tasks are unaffected.

2. **`coerceReproResult` is the single choke point for repro JSON → typed result.** Confirmed:
   [coding-worker.ts](../../src/workers/coding-worker.ts#L113-L139); both workers call it.
   If false: parsing would need to be added per-worker instead of once.

3. **The report already has a `### Screenshots` placeholder.** Confirmed:
   [reproduction-report.ts](../../src/reports/reproduction-report.ts#L99-L101) prints
   "_None captured in this run._" — G2 only needs to populate it from the result.
   If false: a new section must be added rather than filled.

4. **`needsBrowser` is already parsed and available on every issue.** Confirmed:
   [parse-bug.ts](../../src/providers/parse-bug.ts#L84). The workflow can read
   `issue.parsedBug.needsBrowser` with no new parsing.
   If false: the gate would need new detection logic.

5. **Tests are vitest, live in `tests/`, and import source with explicit `.ts` paths.**
   Confirmed: [tests/redact-secrets.test.ts](../../tests/redact-secrets.test.ts).

## Approach

Deliver the browser capability as **prompt + environment only**, gated by the existing
`needsBrowser` flag, and surface what the worker captures. reprokit does not drive the
browser and does not edit target code — it tells the worker the tool is available, hands
it a safely-constrained environment, and renders the evidence the worker reports back.

Concretely, four small seams:

1. **Capability flag**: add an optional `browser?: boolean` to `ReproWorkerInput`. The
   prompt builders gain a capabilities argument; when `browser` is on they append a
   `BROWSER_PROTOCOL` block, otherwise the prompt is unchanged.
2. **Result field**: add `screenshots?: string[]` to `ReproWorkerResult`; `coerceReproResult`
   reads `screenshots` from the worker JSON, defaulting to `[]`.
3. **Report**: `renderReproductionReport` fills the existing `### Screenshots` section from
   `result.screenshots`.
4. **Constrained env**: a new `buildBrowserEnv(runKey)` returns the `AGENT_BROWSER_*` vars;
   the workflow passes them (plus `browser: true`) into the worker input for `needsBrowser`
   issues, and the workers forward `input.env` to `safeExec`.

Rejected simpler alternative: "just put `agent-browser` in the base prompt for every bug."
Rejected because it violates G4 (changes behavior for non-browser bugs), wastes worker
context/tokens, and removes the security gate — every run would carry browser guidance even
when no browser is wanted.

## Tradeoffs

- Worker-driven (not orchestrator-driven) browser use → the evidence depends on the worker
  actually following the protocol and on the tool being installed → acceptable because it
  mirrors how every other capability in reprokit already works (workers are autonomous CLI
  agents), keeps reprokit from owning a browser/dev-server lifecycle, and degrades cleanly to
  today's behavior when the tool is absent.
- Gating on the heuristic `needsBrowser` flag → some misclassification at the edges → acceptable
  for v1; the flag already governs the existing browser-check path, so this is consistent.

## Components Affected

| Exact path | Role | Notes |
|---|---|---|
| `src/types.ts` | Modified | Add `browser?: boolean` + `env?: Record<string,string>` to `ReproWorkerInput`; add `screenshots?: string[]` to `ReproWorkerResult` |
| `src/workers/prompts.ts` | Modified | Add `BROWSER_PROTOCOL` + `BROWSER_PROTOCOL_FIX` consts; add a capabilities arg to `buildReproPrompt`/`buildFixPrompt`; append the matching block only when browser is on |
| `src/workers/coding-worker.ts` | Modified | `coerceReproResult` reads `screenshots` (via existing `asStringArray`), defaulting to `[]` |
| `src/reports/reproduction-report.ts` | Modified | Render `result.screenshots` into the existing `### Screenshots` section |
| `src/workflow/browser-env.ts` | New | `buildBrowserEnv(runKey)` → constrained `AGENT_BROWSER_*` env (headless, per-run session, localhost allowlist) |
| `src/workflow/issue-workflow.ts` | Modified | For `needsBrowser` issues, pass `browser: true` + `buildBrowserEnv(key)` into the repro, pre-fix, and post-fix worker inputs; thread `result.screenshots` into report state |
| `agent/tools/run_repro_worker.ts` | Modified | CR-002: spread `browserFieldsFor(issue, key)` into the `runRepro` input so the Eve agent surface is at parity with the standalone workflow |
| `agent/tools/run_fix_worker.ts` | Modified | CR-002: spread `browserFieldsFor(issue, key)` into the `runFix` input so the fix worker can verify its change in a browser |
| `src/types.ts` (CR-002) | Modified | Add `browser?`/`env?` to `FixWorkerInput`; add `screenshots?` to `FixWorkerResult` |
| `src/workers/coding-worker.ts` (CR-002) | Modified | `coerceFixResult` reads `screenshots`, defaulting to `[]` |
| `src/workers/claude-worker.ts` / `codex-worker.ts` (CR-002) | Modified | `runFix` passes the capability to `buildFixPrompt` and `env: input.env` to `safeExec` |
| `src/workflow/issue-workflow.ts` (CR-002) | Modified | Spread `browserFieldsFor` into the `runFix` call; render screenshots in the Fix Report and the Post-Fix Verification Report |
| `src/workers/claude-worker.ts` | Modified | Pass capabilities to the prompt builders and `env: input.env` to `safeExec` |
| `src/workers/codex-worker.ts` | Modified | Same as claude-worker (mirror); browser repro uses the existing sandbox flags |
| `src/workers/mock-worker.ts` | Reference | Confirm it still satisfies the updated types; no behavior change expected |
| `tests/worker-prompts.test.ts` | Modified | Browser-capability cases for the prompt builders: block present-when-on / byte-identical-when-off (consolidated into the existing file per CR-001) |
| `tests/browser-env.test.ts` | New | `buildBrowserEnv` + `browserFieldsFor`: headless, per-run session, localhost allowlist, gate by `needsBrowser` |
| `tests/coding-worker.test.ts` | New | `coerceReproResult` parses `screenshots`, defaults to `[]` |
| `tests/reproduction-report.test.ts` | Modified | `### Screenshots` populated when present, "_None captured_" when empty (file already existed; per CR-001) |

## New Artifacts

- File: `src/workflow/browser-env.ts` — `buildBrowserEnv(runKey: string | number): Record<string,string>`.
- Type changes: `ReproWorkerInput.browser?`, `ReproWorkerInput.env?`, `ReproWorkerResult.screenshots?` in `src/types.ts`.
- Test files: `tests/browser-env.test.ts` (new), `tests/coding-worker.test.ts` (new); plus browser cases added to the existing `tests/worker-prompts.test.ts` and `tests/reproduction-report.test.ts` (Modified, per CR-001).
- Migration: none. New package in package.json: none (the tool lives in the execution environment, not as a reprokit dependency).

## What This Plan Does NOT Do

- Does not add orchestrator-driven `agent-browser batch` scripts (Level B).
- Does not touch the existing `e2e`/`playwright` path in `project-checks.ts`.
- Does not manage dev-server startup or ports (no `portless` work here).
- Does not provision `agent-browser`/Chrome into any image — that is an ops follow-up.
- Does not change behavior for non-`needsBrowser` issues.

## External Dependencies

⛔ **NEW DEPENDENCY — requires human approval (this is the gate that blocks plan approval).**

- `agent-browser` (vercel-labs) CLI **plus a Chrome/Chromium binary** must exist in the
  worker execution environment for the captured evidence to be real. reprokit gains no new
  npm dependency, but it now *relies on an external tool being present at runtime*. The
  feature must degrade cleanly (no evidence, no error) when the tool is absent, but adopting
  the dependency at all is a human decision per .sdd/autonomy.md.

## Risks & Open Questions

- **Risk — Codex repro sandbox is `read-only`.** [codex-worker.ts](../../src/workers/codex-worker.ts#L53)
  runs repro with `--sandbox read-only`, which may block launching the agent-browser daemon
  or writing screenshots. → Mitigation: treat the Claude worker as the primary browser path
  for v1; document the Codex limitation; do not loosen the Codex sandbox in this spec.
- **Risk — untrusted target code + a real browser.** → Mitigated by G5 (headless, per-run
  session, localhost-only allowlist). The browser is the new attack surface; the allowlist is
  the control. Note `safeExec`'s `assertSafeCommand` guard does **not** police commands the
  worker runs internally, so the env allowlist is the real boundary.
- **Risk — tool absent at runtime.** → The capability is additive guidance; a worker without
  `agent-browser` simply reports no screenshots. Verified indirectly by the off-path tests.
- Open: none blocking. The two non-blocking questions are resolved with defaults in
  `1-requirements.md`.

## Abort Criteria

- Any assumption above is found false during implementation (esp. #1 env inheritance, #3 the
  report placeholder).
- A "Components Affected" file has diverged from this plan's described interface since drafting
  (e.g. `coerceReproResult` or the prompt builders were refactored).
- Making the Claude worker capture a screenshot requires loosening its permission mode or the
  Codex sandbox beyond what exists today → stop and return to planning.
- A task would require touching a file not listed in "Components Affected".

## Gap Handling

Implementation-time ambiguities or impossibilities go to `/impl-gap` →
`specs/agent-browser-repro/impl-gaps.md`. If a resolution needs a requirements/plan change,
escalate via `/spec-amend` before editing approved spec files.

## Verification

- Task 1: `buildReproPrompt(issue, { browser: true })` contains agent-browser guidance;
  `buildReproPrompt(issue, { browser: false })` is byte-identical to current output
  (run: `tests/prompts.test.ts`, both must be red before the capabilities arg exists).
- Task 2: claude/codex workers pass `browser` into the prompt builder and `env` into
  `safeExec` (run: typecheck + worker unit assertion that the prompt includes the block when
  the input flag is set).
- Task 3: `coerceReproResult` maps `screenshots` and defaults to `[]`
  (run: `tests/coding-worker.test.ts`).
- Task 4: `renderReproductionReport` lists screenshot paths when present and keeps
  "_None captured_" when empty (run: `tests/reproduction-report.test.ts`) — satisfies
  "Scenario: reproduction report renders captured browser evidence".
- Task 5: `/fix` repro/pre-fix/post-fix calls pass `browser`/`env` for `needsBrowser` issues
  (run: targeted assertion on the worker input built by the workflow).
- Task 6: `buildBrowserEnv(key)` returns `AGENT_BROWSER_HEADED=0`, a per-run
  `AGENT_BROWSER_SESSION`, and a localhost `AGENT_BROWSER_ALLOWED_DOMAINS`
  (run: `tests/browser-env.test.ts`) — satisfies "Scenario: the browser environment ... is constrained".
- Full suite (`npm test`) stays green after every task.

## Task Count Estimate

6 tasks.

---

## Approval

Date:
Approved by:
Notes: Blocked on human approval of the new external dependency (agent-browser + browser binary). See "External Dependencies".
