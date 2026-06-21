---
description: >-
  Use when a repro or fix worker hits ambiguity, missing permissions, unsafe
  scope, unreproducible behavior, missing dependencies, failing checks, secrets,
  destructive operations, or any condition requiring human direction.
---

# Worker Hard Stop Policy

Hard stops protect the project from guessed reproductions and unsafe fixes.

## Stop Immediately When

- The issue cannot be reproduced and no concrete failing evidence exists.
- The requested change is a feature, migration, security-sensitive change, data
  deletion, release, deploy, or dependency change.
- The worker needs secrets, production access, private credentials, or external
  service mutation.
- The fix requires broad refactoring or public API changes.
- Tests or checks fail in a way unrelated to the bug and cannot be isolated.
- The worker is about to use destructive commands or force-push.
- The repo state is inconsistent with the issue context.

## Report Format

When stopping, include:

- Phase: triage, repro, fix, checks, post-fix verification, or PR.
- Blocking fact.
- Evidence collected so far.
- Why continuing would require guessing or unsafe action.
- Minimal human decision needed.

## Anti-Patterns

- Do not continue with a "best effort" fix after a failed reproduction.
- Do not hide failed checks behind a PR.
- Do not ask for broad permission when one specific approval would unblock.
