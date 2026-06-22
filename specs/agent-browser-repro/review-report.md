# Review Report — Agent-Browser Repro Evidence

Date: 2026-06-22
Spec: specs/agent-browser-repro/
Result: FOLLOW_UPS

---

## Inputs Reviewed

- Verify report: specs/agent-browser-repro/verify-report.md (Result: PASS)
- Requirements: specs/agent-browser-repro/1-requirements.md
- Plan: specs/agent-browser-repro/2-plan.md (Approved; CR-001 applied)
- Tasks: specs/agent-browser-repro/3-tasks.md
- Changed files:
  - src/types.ts
  - src/workers/prompts.ts
  - src/workers/coding-worker.ts
  - src/workers/claude-worker.ts
  - src/workers/codex-worker.ts
  - src/reports/reproduction-report.ts
  - src/workflow/browser-env.ts (new)
  - src/workflow/issue-workflow.ts
  - tests/worker-prompts.test.ts, tests/coding-worker.test.ts, tests/reproduction-report.test.ts, tests/browser-env.test.ts

---

## Qualitative Checks

| Check | Status | Evidence |
|---|---|---|
| Naming is clear and consistent | PASS | `WorkerCapabilities`, `BROWSER_PROTOCOL`, `browserSection`, `buildBrowserEnv`, `browserFieldsFor` read in line with existing `build*Prompt`/`coerce*` naming |
| Implementation is the simplest viable approach | PASS | Prompt+env only; reuses existing `needsBrowser` gate, `safeExec` env, `asStringArray`, `bullets`, and the report's pre-existing `### Screenshots` placeholder — no new abstraction layer |
| Abstractions do not leak unnecessary details | PASS | `browserFieldsFor` returns a spreadable `Pick<ReproWorkerInput,...>`; the workflow just spreads it, unaware of env-var names |
| No misleading comments or stale documentation | PASS | Doc comments on `BROWSER_PROTOCOL`/`buildBrowserEnv` explain the untrusted-repo rationale; the schema-vs-prose decision for `screenshots` is documented in code |
| No obvious copy-paste or avoidable duplication | PASS | Browser cases consolidated into the existing `worker-prompts.test.ts` (the CR-001 driver) rather than a parallel file; claude/codex edits are the minimal symmetric change |
| Minor follow-ups are recorded below | FOLLOW_UPS | See Follow-ups |

---

## Findings

- The off-path byte-identical guarantee (G4) is enforced structurally: `browserSection()` returns `""` when off, and `REPRO_RESULT_SCHEMA` was deliberately not changed. This is the right call and is locked by a test.
- Gating via `browserFieldsFor` keeps the workflow diff to a single spread at each of the three `runRepro` sites — low blast radius, easy to read.

---

## Follow-ups

Non-blocking; file as separate `/bugfix` or a follow-up spec if accepted:

1. **`screenshots` is requested in prose, not in the result schema.** Adherence relies on the worker reading `BROWSER_PROTOCOL` and adding the field. This was a conscious trade to keep the off-path byte-identical, but a worker may omit it. If capture rates are low in practice, consider a browser-variant repro schema rather than baking `screenshots` into the shared one.
2. **Screenshots are referenced by path, not collected/relocated.** `BROWSER_PROTOCOL` suggests `./.reprokit-artifacts/<name>.png` under the worker cwd, and the report lists whatever paths the worker returns. They are only useful if the run checkout is inspectable; nothing copies them into the durable run dir or PR. Matches requirements assumption #4, but worth a follow-up if screenshots should survive with the report/PR.
3. **Codex `read-only` repro sandbox** may block launching the browser daemon / writing screenshots (documented in 2-plan.md Risks). No code action now; revisit if Codex becomes a primary browser path.

---

## Escalations

None.

---

## Conclusion

Implementation is clear, minimal, and well-tested; `/finish` may proceed — the three follow-ups are non-blocking and recorded for later.
