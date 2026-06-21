---
description: >-
  Use for UI/browser bugs that need Playwright, browser console logs, network
  inspection, screenshots, traces, viewport checks, or post-fix browser
  verification.
---

# Browser And Playwright Debugging

Use browser evidence when the bug is visual, interaction-driven, route-driven,
or only visible after client-side behavior.

## First Checks

- Detect Playwright/e2e scripts before inventing commands.
- Run the app the way the repo expects: dev server, preview server, or test
  server fixture.
- Capture console errors, failed network requests, screenshots, and trace paths.
- Test the viewport mentioned in the issue; if absent, check one desktop and
  one mobile viewport for layout bugs.

## Repro Strategy

- Prefer an existing Playwright spec when one covers the route.
- Add a minimal temporary or focused spec only when the worker is allowed to
  create tests.
- Use stable selectors: roles, labels, text, or existing test IDs.
- Wait for user-visible state instead of arbitrary timeouts.

## Evidence To Report

- Command run.
- Browser and viewport.
- Route and interaction sequence.
- Console errors and network failures.
- Screenshot, trace, or report path.
- Whether the same bug appears after reload or in a production build.

## Fix Bias

- Fix the state, rendering, layout, or network cause rather than hard-coding a
  Playwright wait.
- Do not hide console errors unless the underlying cause is resolved.
