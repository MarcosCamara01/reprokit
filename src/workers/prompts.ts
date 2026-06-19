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

/**
 * Shared "hard stop" instruction. A worker that hits a decision only a human
 * should make must stop instead of guessing and describe what it needs.
 */
export const HARD_STOP_RULE = `Hard stops:
If you reach a point where continuing would require a decision a human must make,
do NOT guess and do NOT proceed. Stop and report it. This includes:
- Ambiguous or contradictory requirements you cannot resolve from the repo.
- Adding a new dependency, or changing auth, payments, billing, security, or permissions.
- Deleting data, or changing a public API or external contract.
- Work that falls outside the scope of this issue.
- The task being technically infeasible as described.
When this happens, set "hardStop" to an object (otherwise leave it null) and set
"fixed"/"reproduced" to false.`;

const HARD_STOP_SCHEMA = `  "hardStop": null | {
    "category": "ambiguous-requirements | new-dependency | auth | payments | security | data-loss | public-api | external-contract | out-of-scope | infeasible | other",
    "reason": "what you ran into",
    "needs": "the exact decision or input you need from a human to continue"
  }`;

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
  "recommendation": "...",
${HARD_STOP_SCHEMA}
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
  "recommendation": "...",
${HARD_STOP_SCHEMA}
}`;

/**
 * SDD bug protocol, distilled from sddguard's /bugfix command and execution
 * principles (.sdd/workflow.md). reprokit applies sddguard to GitHub bug fixes by
 * baking the protocol into the worker prompts: the workers run one-shot and return
 * JSON, so the protocol travels in the prompt rather than as installed slash
 * commands. Stages map onto the pipeline — Reproduce/Diagnose = runRepro,
 * Fix = runFix, Validate = project checks + post-fix reproduction.
 */
export const SDD_PRINCIPLES = `Execution principles (SDD):
- Surface assumptions — state what you assume; when unclear, prefer a hard stop over a silent guess.
- Minimum code — only what the bug requires; no extra abstractions or "while I'm here" cleanups.
- Surgical changes — touch only the lines the root cause needs; never reformat, rename, or refactor adjacent code. If you spot an unrelated problem, note it, don't fix it.
- Verify before done — "fixed" means a test (or deterministic repro) that captured the bug now passes and the suite stays green.`;

export const REPRO_PROTOCOL = `SDD stages for this step — Reproduce -> Diagnose (do not skip; do not fix yet):
- Reproduce — if the repo has a test suite, prefer a minimal failing test that captures the bug; otherwise establish a deterministic minimal repro (exact steps, inputs, observed vs expected). If you cannot reproduce it at all, set "reproduced": false and stop — do not guess.
- Diagnose — find the ROOT CAUSE, not the symptom, and state it in one sentence in "suspectedCause". If you cannot, say so instead of inventing one.`;

export const FIX_PROTOCOL = `SDD stages for this step — Fix -> Validate:
- Fix — the minimum change that addresses the root cause from the reproduction report; restate that root cause in "summary".
- Scope guard — if a correct fix would exceed roughly one file or ~50 lines, or needs a broader redesign, do NOT sprawl: set "hardStop" with category "out-of-scope" so a human can scope it.
- Validate — make the change so a test capturing the bug passes and the full suite stays green; list tests in "testsAddedOrUpdated".`;

export function buildReproPrompt(issue: IssueContext, contextNote?: string): string {
  return `You are a bug reproduction worker.

You are working inside an isolated repository checkout.

Issue:
${issueContextBlock(issue)}
${contextNote ? `\nAdditional context:\n${contextNote}\n` : ""}

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

${SDD_PRINCIPLES}

${REPRO_PROTOCOL}

${HARD_STOP_RULE}

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

${SDD_PRINCIPLES}

${FIX_PROTOCOL}

${HARD_STOP_RULE}

Return ONLY a single JSON object as the last thing you print, in this exact shape:

${FIX_RESULT_SCHEMA}`;
}
