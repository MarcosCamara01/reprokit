# Skill: React Debugging

Reference for reproducing/fixing React bugs.

## Common areas

- **State updates** — stale closures, batching, derived-state mistakes.
- **Effects** — missing/extra deps, cleanup, double-invoke in StrictMode.
- **Rendering** — keys in lists, memoization (`useMemo`/`useCallback`/`memo`).
- **Context** — unnecessary re-renders, provider value identity.
- **Refs** — accessing DOM before mount, forwarding refs.

## Repro tips

- Reproduce with the smallest component tree possible.
- Toggle StrictMode to expose effect/cleanup bugs.
- Add a failing test with React Testing Library when feasible.

## Filter/layout-state bugs (e.g. items disappear after clearing filters)

- Check that "clear filters" resets ALL derived state, not just the inputs.
- Check that a layout switch (grid/list) doesn't drop filtered results.
