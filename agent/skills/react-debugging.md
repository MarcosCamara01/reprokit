---
description: >-
  Use for reproducing, diagnosing, or fixing React UI bugs involving component
  state, effects, refs, context, rendering, list keys, memoization, controlled
  inputs, StrictMode behavior, or stale UI after user interactions.
---

# React Debugging

Reduce the UI bug to the smallest component state transition that explains the
visible failure.

## First Checks

- Identify the user action, state before the action, expected state after it,
  and actual rendered result.
- Find the source of truth for the data: props, local state, context, URL,
  external store, server data, or form library.
- Check whether derived state is duplicated and can drift.
- Reproduce under StrictMode when effects or cleanup are involved.

## Common Root Causes

- Stale closures in callbacks, timers, event listeners, or async effects.
- Missing or excessive effect dependencies.
- Derived state initialized once but not updated when inputs change.
- List keys that cause React to preserve the wrong component instance.
- Controlled/uncontrolled input mismatch.
- Context provider values recreated every render, causing unexpected updates.
- `useMemo`, `useCallback`, or `memo` hiding an actual data-flow bug.
- Clear/reset actions that reset visible inputs but not filtered or paginated
  data.

## Evidence To Capture

- The exact interaction sequence.
- DOM or screenshot evidence of the wrong state.
- Console errors or React warnings.
- A focused component test when feasible.

## Fix Bias

- Prefer a single source of truth over syncing duplicate state.
- Prefer functional state updates when the next value depends on the previous
  value.
- Make reset actions reset all dependent state: filters, pagination, sorting,
  selection, active tab, and layout mode.
- Avoid adding memoization as a fix unless profiling proves it is the cause.
