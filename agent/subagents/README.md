# Subagents

Per the Eve docs, a subagent is a directory under `subagents/` with its own
`instructions`, `tools`, and `sandbox`, and the parent agent calls it much like
it calls a tool. We split the workflow into focused roles so each has a tight
prompt and a minimal toolset:

- `triage-agent/` — classify the issue, decide if there's enough info.
- `repro-agent/` — reproduce the bug in an isolated checkout (no fixing).
- `fix-agent/` — apply the smallest safe fix (only after approval).
- `test-agent/` — run and interpret project checks.
- `report-agent/` — render and post reports/comments.

⚠️ API CONFIDENCE: PARTIAL. The directory convention is documented, but the exact
per-subagent config (whether each needs its own `agent.ts`, how `tools/` are
scoped, how the parent invokes it) is not published verbatim.

TODO(eve): after `npm install eve@latest`, confirm the subagent contract in
`node_modules/eve/dist/docs/public/` and, if required, add an `agent.ts` and a
scoped `tools/` directory to each subagent. Today the same work is reliably done
by the top-level agent calling the `agent/tools/*` tools directly, so these
subagents are an optional refinement, not a dependency of the MVP flow.
