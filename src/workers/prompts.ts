import type { IssueContext } from "../types.ts";

/** Compact, secret-free serialization of the issue for a worker prompt. */
export function issueContextBlock(issue: IssueContext): string {
  const p = issue.parsedBug;
  return [
    `Title: ${issue.title}`,
    `URL: ${issue.url}`,
    `Labels: ${issue.labels.join(", ") || "(none)"}`,
    ``,
    `Summary: ${p.summary}`,
    p.expectedBehavior ? `Expected: ${p.expectedBehavior}` : "",
    p.actualBehavior ? `Actual: ${p.actualBehavior}` : "",
    p.reproductionSteps.length
      ? `Reproduction steps:\n${p.reproductionSteps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`
      : "Reproduction steps: (none given)",
    p.environment ? `Environment: ${p.environment}` : "",
    ``,
    `Original issue body:`,
    issue.body,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export const REPRO_RESULT_SCHEMA = `{
  "reproduced": true | false,
  "confidence": 0-100,
  "summary": "...",
  "reproductionSteps": ["..."],
  "commandsRun": ["..."],
  "relevantLogs": ["..."],
  "suspectedFiles": ["..."],
  "suspectedCause": "...",
  "createdFiles": ["..."],
  "modifiedFiles": ["..."],
  "recommendation": "..."
}`;

export const FIX_RESULT_SCHEMA = `{
  "fixed": true | false,
  "confidence": 0-100,
  "summary": "...",
  "filesChanged": ["..."],
  "testsAddedOrUpdated": ["..."],
  "commandsRun": ["..."],
  "relevantLogs": ["..."],
  "risks": ["..."],
  "recommendation": "..."
}`;

export function buildReproPrompt(issue: IssueContext): string {
  return `You are a bug reproduction worker.

You are working inside an isolated repository checkout.

Issue:
${issueContextBlock(issue)}

Your task:
1. Inspect the repository.
2. Understand the bug report.
3. Try to reproduce the bug.
4. Run only relevant commands.
5. Create a minimal failing test only if it is safe and useful.
6. Do not fix the bug yet.
7. Do not commit.
8. Do not push.
9. Do not touch secrets or production environment files (.env, .env.*, key files).
10. Produce a structured report.

Return ONLY a single JSON object as the last thing you print, in this exact shape:

${REPRO_RESULT_SCHEMA}`;
}

export function buildFixPrompt(issue: IssueContext, report: string): string {
  return `You are a bug fix worker.

You are working inside an isolated repository checkout.

Issue:
${issueContextBlock(issue)}

Reproduction report:
${report}

Rules:
1. Make the smallest safe fix.
2. Preserve existing architecture and style.
3. Add or update a test if it makes sense.
4. Do not touch unrelated files.
5. Do not perform large formatting changes.
6. Do not modify secrets or environment files.
7. Do not run destructive commands.
8. Do not commit unless explicitly instructed by the orchestrator.
9. Explain every file changed.

Return ONLY a single JSON object as the last thing you print, in this exact shape:

${FIX_RESULT_SCHEMA}`;
}
