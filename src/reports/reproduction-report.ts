import type { IssueContext, ReproWorkerResult } from "../types.ts";
import { redactSecrets } from "../utils/redact-secrets.ts";

export interface ReproReportInput {
  issue: IssueContext;
  result: ReproWorkerResult;
  environment?: string;
  title?: string;
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
 * Render the canonical reproduction report as markdown. Pure and deterministic
 * (no timestamps, no fs), so it is straightforward to unit test. All free text
 * is run through secret redaction.
 */
export function renderReproductionReport(input: ReproReportInput): string {
  const { issue, result } = input;
  const r = result;
  const title = input.title ?? "Reproduction Report";
  const worker = `${r.provider}${r.mocked ? " (MOCK - CLI not installed)" : ""}`;
  const blocker = r.reproduced
    ? "_None. The bug was reproduced and a fix can be attempted after review._"
    : "The bug was not reproduced. A fix should wait for clearer evidence, logs, or a failing test.";

  const md = `# ${title}

## Issue

- Source: ${issue.provider}
- URL: ${issue.url}
- Title: ${issue.title}
- Labels: ${issue.labels.join(", ") || "_none_"}

## Outcome

- Reproduced: ${r.reproduced ? "yes" : "no"}
- Confidence: ${r.confidence}/100
- Worker used: ${worker}
- Environment: ${input.environment ?? issue.parsedBug.environment ?? "_unknown_"}

## What I Tried

- Prepared an isolated checkout for the issue.
- Asked the ${r.provider} worker to reproduce the reported behavior.
- Followed or inferred these reproduction steps:

${bullets(r.reproductionSteps)}

## What I Found

- Summary: ${r.summary || "_No summary provided._"}
- Suspected cause: ${r.suspectedCause ?? "_Unknown._"}
- Suspected files:

${bullets(r.suspectedFiles)}

## What Changed

_No code changes were made. Reproduction runs are read-only._

## Checks Passed

_No project checks are required in reproduction-only mode. Worker commands are listed under Evidence._

## Why It Blocked

${blocker}

## What To Do Next

- Comment \`/fix\` to attempt a fix with the default worker.
- Comment \`/fix codex\` to attempt a fix with Codex.
- Comment \`/fix claude\` to attempt a fix with Claude Code.
- Comment \`/compare\` to run both workers and compare diagnoses.
- Comment \`/stop\` to stop work on this issue.

## Evidence

### Commands Run

${codeBlock(r.commandsRun)}

### Logs

${codeBlock(r.relevantLogs)}

### Screenshots

_None captured in this run._

### Failing Tests

${bullets(r.createdFiles ?? [], "_No reproduction test created._")}

### Recommendation

${r.recommendation || "_None._"}
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

  // Keep the decision sections and drop the bulky evidence in the middle. The
  // full report is still saved to disk.
  const evidenceIdx = fullReport.indexOf("## Evidence");
  const head =
    evidenceIdx > 0 ? fullReport.slice(0, evidenceIdx) : fullReport.slice(0, maxChars / 2);

  const note =
    "\n> Evidence (commands, logs, screenshots, and failing tests) was trimmed from this comment. " +
    "The full report is saved alongside the run.\n\n";

  const body = `${head}${note}`.slice(0, maxChars);
  return { body, truncated: true };
}
