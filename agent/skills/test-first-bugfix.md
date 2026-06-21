---
description: >-
  Use when converting a reproduced bug into a failing automated test before
  fixing it, choosing test scope, or deciding when a manual reproduction is
  acceptable instead of a test.
---

# Test-First Bugfix

When the repo has a relevant test surface, capture the bug with a failing test
before changing implementation code.

## Choose The Smallest Test Surface

- Pure function bug: unit test the function.
- Component state bug: component or React Testing Library test.
- Route/API bug: route handler or integration test.
- Browser-only bug: Playwright/e2e test when available.
- Build/type bug: typecheck or build command may be the repro.

## Red Test Requirements

- The test fails before the fix for the same reason the issue reports.
- The failure message is specific enough to guard the regression.
- The test does not depend on external services unless the repo already has
  stable fixtures for them.
- The test avoids overfitting to implementation details unless the bug is in
  that implementation contract.

## When Manual Repro Is Acceptable

Use manual repro when:

- The repo has no practical test setup for this surface.
- The bug depends on external state that cannot be safely mocked.
- The reproduction is browser/visual and no e2e tooling exists.
- The fix is documentation/config-only and automated coverage would be fake.

In that case, write exact replay steps and expected output.

## After Fix

- Confirm the new failing test is now green.
- Run the relevant full test command, not only the focused file, when feasible.
