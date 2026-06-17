# Skill: Bug Triage

Use this when deciding whether an issue is reproducible and what it needs.

## Checklist

- Is this actually a bug (vs. a question, feature request, or support)?
- Are there **steps to reproduce**? If not, ask for them.
- Is **expected behavior** stated?
- Is **actual behavior** stated?
- Is the **environment** described (OS, browser, runtime, versions)?
- Does reproduction likely need a **browser**, **database**, or **auth**?
- Can it plausibly be reproduced **locally** in a clean checkout?

## Decision

- If steps OR (expected + actual) are present → enough to attempt `/repro`.
- Otherwise → post the "need more info" template and stop.

## Anti-patterns

- Do not invent reproduction steps.
- Do not assume the stack; detect it from the repo.
- Do not start a checkout for non-bugs.
