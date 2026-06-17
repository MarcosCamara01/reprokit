import type { ReproWorkerResult } from "../types.js";
import { redactSecrets } from "../utils/redact-secrets.js";

export interface CompareReportInput {
  issueTitle: string;
  issueUrl: string;
  codex: ReproWorkerResult;
  claude: ReproWorkerResult;
}

function cell(text: string | undefined): string {
  return (text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 200) || "—";
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

  const md = `# Compare Report — Codex vs Claude Code

**Issue:** [${input.issueTitle}](${input.issueUrl})

| Worker | Reproduced | Confidence | Suspected Cause | Files | Recommendation |
|---|---:|---:|---|---|---|
${row(codex)}
${row(claude)}

## Recommended worker

**${winner === "tie" ? "Tie" : winner}** — ${reason}

## Differences

- Reproduced: codex=${codex.reproduced ? "yes" : "no"}, claude=${claude.reproduced ? "yes" : "no"}
- Confidence: codex=${codex.confidence}, claude=${claude.confidence}

## Suggested next action

${
  winner === "tie"
    ? "Either worker is a reasonable choice. Reply `/fix codex` or `/fix claude`."
    : `Reply \`/fix ${winner}\` to attempt a fix with the recommended worker, or \`/fix\` to use the default.`
}
`;

  return redactSecrets(md);
}
