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

Each subagent has its own `agent.ts` because Eve requires declared subagents to
export `defineAgent({ description, model })`. Today the same work is also
available through the top-level `agent/tools/*` tools, so these subagents are a
specialist delegation surface rather than the only path through the MVP flow.
