---
description: >-
  Use when generating, reviewing, or summarizing the reproduction report for
  /repro, including reproduced/not reproduced status, evidence, steps, suspected
  cause, suspected files, and the next-action menu.
---

# Reproduction Report

The reproduction report is the core deliverable of `/repro`. It must let a
human understand exactly what was tried and replay the result.

## Required Sections

1. Issue: source, URL, title, labels.
2. Status: reproduced yes/no, confidence, worker, environment.
3. Summary: one concise paragraph.
4. Steps to reproduce: concrete, ordered, and replayable.
5. Evidence: commands, logs, screenshots, traces, failing tests, or console
   output.
6. Suspected cause and suspected files.
7. Recommendation.
8. Next action: `/fix`, `/compare`, or `/stop`.

## Evidence Standards

- Prefer primary evidence from commands, tests, browser traces, or logs.
- Include exact commands that were run.
- Quote only the relevant log lines and redact secrets.
- For UI/browser bugs, mention Playwright artifacts explicitly when present:
  failing spec, trace path, screenshot path, browser console logs, or replay
  command.
- If the bug did not reproduce, explain why and what extra input would help.

## Boundaries

- Never include a code fix in a reproduction report.
- Never imply certainty beyond the evidence.
- Never bury a failed reproduction; make the blocker explicit.
- Keep long raw logs on disk and post a concise, redacted summary.
