import type { IssueContext, ReproWorkerResult } from "../types.ts";
import { redactSecrets } from "../utils/redact-secrets.ts";

export interface ReproReportInput {
  issue: IssueContext;
  result: ReproWorkerResult;
  environment?: string;
}

function bullets(items: string[], empty = "_None._"): string {
  if (!items || items.length === 0) return empty;
  return items.map((i) => `- ${i}`).join("\n");
}

function codeBlock(items: string[]): string {
  if (!items || items.length === 0) return "_None._";
  return "```\n" + items.join("\n") + "\n```";
}

/**
 * Render the canonical reproduction report as markdown. Pure & deterministic
 * (no timestamps, no fs), so it is straightforward to unit test. All free text
 * is run through secret redaction.
 */
export function renderReproductionReport(input: ReproReportInput): string {
  const { issue, result } = input;
  const r = result;

  const md = `# Reproduction Report

## Issue

- Source: ${issue.provider}
- URL: ${issue.url}
- Title: ${issue.title}
- Labels: ${issue.labels.join(", ") || "_none_"}

## Status

- Reproduced: ${r.reproduced ? "✅ yes" : "❌ no"}
- Confidence: ${r.confidence}/100
- Worker used: ${r.provider}${r.mocked ? " _(MOCK — CLI not installed)_" : ""}
- Environment: ${input.environment ?? issue.parsedBug.environment ?? "_unknown_"}

## Summary

${r.summary || "_No summary provided._"}

## Steps to reproduce

${bullets(r.reproductionSteps)}

## Evidence

### Commands run

${codeBlock(r.commandsRun)}

### Logs

${codeBlock(r.relevantLogs)}

### Screenshots

_None captured in this run._

### Failing tests

${bullets(r.createdFiles ?? [], "_No reproduction test created._")}

## Suspected cause

${r.suspectedCause ?? "_Unknown._"}

## Suspected files

${bullets(r.suspectedFiles)}

## Recommendation

${r.recommendation || "_None._"}

## Next action

Reply with:

- \`/fix\` — attempt a fix with the default worker
- \`/fix codex\` — attempt a fix with Codex
- \`/fix claude\` — attempt a fix with Claude Code
- \`/compare\` — run both workers and compare diagnoses
- \`/stop\` — stop work on this issue
`;

  return redactSecrets(md);
}

/**
 * If the report is too large to comfortably post as a comment, return a short
 * summary suitable for the comment body. The full report is always saved to disk.
 */
export function summarizeReportForComment(
  fullReport: string,
  maxChars: number,
): { body: string; truncated: boolean } {
  if (fullReport.length <= maxChars) return { body: fullReport, truncated: false };

  // Keep the header sections (everything up to "## Evidence") plus the tail
  // (Recommendation + Next action), dropping the bulky evidence in the middle.
  const evidenceIdx = fullReport.indexOf("## Evidence");
  const recommendationIdx = fullReport.indexOf("## Recommendation");
  const head =
    evidenceIdx > 0 ? fullReport.slice(0, evidenceIdx) : fullReport.slice(0, maxChars / 2);
  const tail = recommendationIdx > 0 ? fullReport.slice(recommendationIdx) : "";

  const note =
    "\n> ℹ️ Evidence (commands, logs) was trimmed from this comment. " +
    "The full report is saved alongside the run.\n\n";

  const body = `${head}${note}${tail}`.slice(0, maxChars);
  return { body, truncated: true };
}
