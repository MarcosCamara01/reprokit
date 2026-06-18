import type { ReproWorkerResult } from "../types.ts";
import { redactSecrets } from "../utils/redact-secrets.ts";

export interface CompareReportInput {
  issueTitle: string;
  issueUrl: string;
  codex: ReproWorkerResult;
  claude: ReproWorkerResult;
}

function cell(text: string | undefined): string {
  return (text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 200) || "-";
}

function pickWinner(input: CompareReportInput): {
  winner: "codex" | "claude" | "tie";
  reason: string;
} {
  const { codex, claude } = input;
  if (codex.reproduced !== claude.reproduced) {
    const winner = codex.reproduced ? "codex" : "claude";
    return { winner, reason: `${winner} reproduced the bug; the other did not.` };
  }
  if (codex.confidence !== claude.confidence) {
    const winner = codex.confidence > claude.confidence ? "codex" : "claude";
    return { winner, reason: `${winner} reported higher confidence.` };
  }
  return { winner: "tie", reason: "Both workers produced comparable diagnoses." };
}

/** Render the side-by-side compare report (table + recommendation). */
export function renderCompareReport(input: CompareReportInput): string {
  const { codex, claude } = input;
  const { winner, reason } = pickWinner(input);

  const row = (r: ReproWorkerResult) =>
    `| ${r.provider}${r.mocked ? " (mock)" : ""} | ${r.reproduced ? "yes" : "no"} | ${r.confidence} | ${cell(r.suspectedCause)} | ${cell(r.suspectedFiles.join(", "))} | ${cell(r.recommendation)} |`;

  const nextAction =
    winner === "tie"
      ? "Either worker is a reasonable choice. Comment `/fix codex` or `/fix claude`."
      : `Comment \`/fix ${winner}\` to attempt a fix with the recommended worker, or \`/fix\` to use the default.`;

  const md = `# Worker Comparison Report

## Issue

- URL: ${input.issueUrl}
- Title: ${input.issueTitle}

## Outcome

- Recommended worker: ${winner === "tie" ? "tie" : winner}
- Reason: ${reason}

## What I Tried

- Prepared separate read-only checkouts for Codex and Claude.
- Asked each worker to diagnose the issue independently.
- Compared reproduction status, confidence, suspected cause, suspected files, and recommendation.

## What I Found

| Worker | Reproduced | Confidence | Suspected Cause | Files | Recommendation |
|---|---:|---:|---|---|---|
${row(codex)}
${row(claude)}

## What Changed

_No code changes were made. Compare runs are read-only._

## Checks Passed

_No project checks are required in compare mode._

## Why It Blocked

_None. This comparison is advisory._

## What To Do Next

- ${nextAction}
- Comment \`/stop\` to stop work on this issue.

## Evidence

- Reproduced: codex=${codex.reproduced ? "yes" : "no"}, claude=${claude.reproduced ? "yes" : "no"}
- Confidence: codex=${codex.confidence}, claude=${claude.confidence}
`;

  return redactSecrets(md);
}
