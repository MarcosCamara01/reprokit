# Requirements: Agent-Browser Repro Evidence

> **Decisions and trade-offs only — no implementation.** Code snippets are allowed
> only when they reduce ambiguity (e.g. a function signature, an example input/output,
> a concrete error shape). If a snippet is doing anything more than that, it belongs
> in `2-plan.md`, not here.

## Status

- [x] Draft
- [x] Reviewed
- [x] Ready for /spec-plan — all open questions resolved, all scenarios written

> Self-approved by agent per .sdd/autonomy.md (Mode: autonomous): all scenarios are
> written and no blocking question remains. Note: the plan derived from these
> requirements introduces a **new external dependency** (`agent-browser` + a browser
> binary in the execution environment), which is a Human-Approval-Required category —
> `/spec-plan` approval is therefore NOT self-approved and stops for a human.

---

## Problem Statement

reprokit's value proposition is turning vague bug reports into **reproducible evidence**.
For web-UI bugs the current evidence is weak. The repro/fix workers are one-shot CLI
agents (`claude`, `codex`) that run inside an isolated checkout and return JSON; they
have no deterministic, first-class way to actually drive a browser, observe the broken
UI, or confirm a fix visually. The only browser-related capability today is running a
repo's **pre-existing** `e2e`/`playwright` script via `runProjectChecks` when
`RUN_BROWSER_CHECKS=1` (see [project-checks.ts](../../src/workflow/project-checks.ts)).
If the target repo has no such script — the common case for an external bug report —
there is zero visual/DOM evidence at reproduction time, and post-fix verification for a
UI bug is effectively blind. That is exactly the class of bug `parsedBug.needsBrowser`
already flags (see [parse-bug.ts](../../src/providers/parse-bug.ts)) but nothing acts on.

## Goals

- **G1**: When a bug is flagged `needsBrowser`, the **reproduction** worker prompt
  instructs the worker to use `agent-browser` to reproduce the bug in a real headless
  browser and capture evidence (an accessibility snapshot and at least one screenshot)
  saved under the run directory.
- **G2**: Browser evidence captured by the worker is carried back in the structured
  worker result and rendered in the reproduction report (populating the report's
  existing `### Screenshots` section) so it appears in the issue comment and PR body.
- **G3**: During `/fix` **post-fix verification**, when `needsBrowser`, the worker is
  prompted to re-drive the same flow against the fixed tree and capture after-fix
  evidence, which appears in the post-fix verification report.
- **G4**: The browser capability is **gated**: bugs that are not `needsBrowser` get
  byte-identical prompts and behavior to today — no browser overhead, no prompt change.
- **G5**: Because target repos are untrusted, the browser is constrained per run:
  headless, a per-run isolated session, and a navigation allowlist limited to localhost.
- **G6** (added by CR-002): When a bug is `needsBrowser`, the **fix** worker itself is
  granted `agent-browser` so it can debug the broken UI and confirm in a real browser that
  its change resolves the bug before reporting `fixed: true`. This is in addition to the
  orchestrator's independent post-fix verification (G3); both layers run.

## Non-Goals

- Does **not** auto-translate `parsedBug.reproductionSteps` into deterministic
  orchestrator-driven browser scripts (the "Level B" `agent-browser batch` idea) — out
  of scope; this spec is worker-driven only.
- Does **not** replace or modify the existing `e2e`/`playwright` project-check path — it
  complements it.
- Does **not** manage the target app's dev-server lifecycle or port allocation. Starting
  whatever server the repro needs is the worker's responsibility; stable URLs / port
  de-confliction (the `portless` idea) is a separate future spec.
- Does **not** add browser behavior to the `MockWorker` beyond threading the new fields
  through so types stay consistent.
- Does **not** provision `agent-browser` or the browser binary into the runtime/sandbox
  image. Environment provisioning is an ops task; this spec only makes reprokit *use* the
  tool when it is present and degrade cleanly when it is not.

## Acceptance Criteria

Scenario: repro prompt includes the browser protocol when the browser capability is on
  Given: an issue and a call to buildReproPrompt with browser capability enabled
  When: the prompt is built
  Then: the returned prompt contains agent-browser usage guidance (open, snapshot, screenshot)
    And: it tells the worker where to write screenshots (the run artifacts directory)

Scenario: repro prompt is unchanged when the browser capability is off
  Given: an issue and a call to buildReproPrompt with browser capability disabled
  When: the prompt is built
  Then: the returned prompt is byte-identical to the current (pre-feature) output
    And: it contains no agent-browser guidance

Scenario: worker result carries browser screenshot paths
  Given: a worker JSON blob containing a "screenshots" array of paths
  When: coerceReproResult parses it
  Then: ReproWorkerResult.screenshots contains those paths
    And: when the blob has no "screenshots" key, the field is an empty array

Scenario: reproduction report renders captured browser evidence
  Given: a ReproWorkerResult whose screenshots array is non-empty
  When: renderReproductionReport runs
  Then: the report's "### Screenshots" section lists each screenshot path
    And: when screenshots is empty the section keeps its current "_None captured_" text

Scenario: the browser environment passed to a browser-enabled worker is constrained
  Given: the browser environment is built for a given run key
  When: buildBrowserEnv(runKey) is called
  Then: it returns AGENT_BROWSER_HEADED=0
    And: AGENT_BROWSER_SESSION is a value unique to that run key
    And: AGENT_BROWSER_ALLOWED_DOMAINS is restricted to localhost (and 127.0.0.1)

## Constraints

- **Technical:** reprokit never edits target code itself. The capability is delivered
  purely via (a) the worker prompt and (b) the process environment the worker inherits.
  The orchestrator only sets a flag, builds env, and collects artifacts.
- **Technical:** must reuse the existing `parsedBug.needsBrowser` gate and the existing
  `safeExec` env-merge model ([safe-exec.ts](../../src/utils/safe-exec.ts) already
  supports an `env` option and strips real secrets).
- **Technical:** worker result parsing must stay tolerant — a missing/garbage
  `screenshots` value must coerce to `[]`, never throw (mirrors `coerceReproResult`).
- **Security:** the browser must be headless, session-isolated per run, and
  domain-restricted to localhost; no Chrome profile reuse.
- **Compatibility:** non-browser bugs must be unaffected (G4) and the change must not
  break the mock-worker path used when a CLI is absent.

## Assumptions

1. **`agent-browser` exposes a stable shell CLI (`open`/`snapshot`/`screenshot`/`click`)
   and honors `AGENT_BROWSER_HEADED`, `AGENT_BROWSER_SESSION`,
   `AGENT_BROWSER_ALLOWED_DOMAINS`.** — per the tool's published usage.
   If wrong: the prompt guidance and env-var names in the plan need to change, but the
   reprokit-side seams (flag, env, artifact collection) stay the same.

2. **The existing `parsedBug.needsBrowser` regex is a good-enough gate for v1.** — it is
   already computed and already used to express "this bug is UI-shaped".
   If wrong: some web bugs miss the browser path (acceptable for v1; tuning the regex is
   a separate concern), and some non-web bugs pay for an unused capability flag (cheap).

3. **Workers inherit their process env from the `safeExec` call that launches them.** —
   confirmed in [claude-worker.ts](../../src/workers/claude-worker.ts) /
   [codex-worker.ts](../../src/workers/codex-worker.ts); both call `safeExec` and
   `safeExec` builds the child env.
   If wrong: a different mechanism (e.g. an `agent-browser.json` written into the
   checkout) is needed to constrain the browser.

4. **Screenshots are referenced by path, not embedded.** Reports already render evidence
   as text/paths and run through secret redaction; embedding image bytes is unnecessary.
   If wrong: report rendering and comment-size handling would need to change materially.

## Open Questions

- [x] ⚠️ NON-BLOCKING — Should browser-enabled reproduction also run under the Codex
  worker, whose repro sandbox is `read-only` and may block launching a browser daemon or
  writing screenshots? (default if unanswered: ship the capability for both workers but
  document the Codex `read-only` limitation as a known risk; the Claude worker
  (`acceptEdits`) is the primary browser path for v1.)
- [x] ⚠️ NON-BLOCKING — Where exactly should screenshots be written? (default: under the
  per-run artifacts dir already used for raw worker output — see `runPaths` /
  `writeRawOutput` — so they travel with the rest of the run evidence.)

## Clarifications

<!-- None required: no blocking questions. Non-blocking questions above carry documented
     defaults, resolvable during planning per .sdd/workflow.md /spec-clarify rules. -->
