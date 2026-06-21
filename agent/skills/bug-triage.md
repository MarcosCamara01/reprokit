---
description: >-
  Use when classifying an incoming GitHub or Linear issue, deciding whether it
  is a real bug, checking whether there is enough evidence to run /repro, or
  drafting the more-information-needed response.
---

# Bug Triage

Classify the issue before any checkout or worker run. The goal is to decide
whether reproduction is evidence-based or would require guessing.

## Decision Path

1. Identify the report type: bug, support question, feature request, flaky
   test, security concern, or operational incident.
2. Extract the observable failure: what changed, what the reporter expected,
   and what actually happened.
3. Check for reproduction inputs: ordered steps, URL/route, command, fixture,
   account state, browser/device, runtime version, logs, or screenshots.
4. Decide the execution surface: browser/UI, CLI, API/network, database/auth,
   build/tooling, TypeScript/typecheck, or unknown.
5. Decide whether `/repro` is safe to attempt.

## Enough Evidence

Attempt `/repro` when at least one of these is true:

- The issue has ordered reproduction steps.
- The issue has both expected behavior and actual behavior, plus enough target
  context to locate the failing area.
- The issue includes a failing command, stack trace, test name, route, or log
  that can be run or inspected in a clean checkout.

Ask for more information when the report lacks both steps and an observable
expected-versus-actual mismatch.

## Missing Info Template

Ask only for the missing facts that would change the next action:

- Steps to reproduce or the exact command that fails.
- Expected behavior and actual behavior.
- Relevant environment: OS, browser, Node/package manager, app version.
- Logs, screenshots, trace, or failing test output.
- Whether auth, seed data, external services, or a specific account is needed.

## Anti-Patterns

- Do not invent reproduction steps.
- Do not infer the framework from the issue text; inspect the repo when needed.
- Do not start a checkout for non-bugs or issues with no observable failure.
- Do not ask for every possible detail when one missing fact would unblock.
