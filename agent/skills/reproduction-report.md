# Skill: Reproduction Report

The reproduction report is the core deliverable of `/repro`. It must be
evidence-led and reproducible by a human.

## Required sections

1. **Issue** — source, URL, title, labels.
2. **Status** — reproduced (yes/no), confidence, worker used, environment.
3. **Summary** — one paragraph.
4. **Steps to reproduce** — concrete, ordered.
5. **Evidence** — commands run, logs, screenshots, failing tests.
6. **Suspected cause** and **suspected files**.
7. **Recommendation**.
8. **Next action** — the `/fix`, `/compare`, `/stop` menu.

## Rules

- Redact secrets everywhere (use the redaction utility).
- Truncate long logs; keep the full report on disk.
- If not reproduced, explain *why* and what would help.
- For UI/browser bugs, call out Playwright evidence explicitly when available:
  failing spec, trace/report path, screenshot path, browser console logs, or
  the command needed to replay the bug.
- Never include a fix in a reproduction report.
