/**
 * Workflow state machine for a single issue's lifecycle.
 *
 * The state is persisted to `.runs/issue-<n>/state.json` (see run-store.ts) so
 * the flow survives restarts. On Vercel/Eve the durable layer is Vercel Workflow;
 * here we keep a simple file-backed mirror that is portable and easy to inspect.
 */

export const WORKFLOW_STATES = [
  "NEW_ISSUE",
  "TRIAGED",
  "NEEDS_MORE_INFO",
  "ENV_PREPARED",
  "REPRO_RUNNING",
  "REPRODUCED",
  "NOT_REPRODUCED",
  "REPORT_POSTED",
  "WAITING_FOR_APPROVAL",
  "FIX_RUNNING",
  "TESTING",
  "PR_CREATED",
  "FIX_FAILED",
  "NEEDS_HUMAN_DECISION",
  "STOPPED",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/**
 * Allowed transitions. Kept permissive on purpose (an issue can be re-triaged,
 * re-reproduced, retried after a failed fix, etc.). The orchestrator owns the
 * practical gates: `/fix` now runs reproduction before code changes, then
 * checks and verifies again before PR creation.
 */
const TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  NEW_ISSUE: ["TRIAGED", "STOPPED"],
  TRIAGED: ["NEEDS_MORE_INFO", "ENV_PREPARED", "STOPPED"],
  NEEDS_MORE_INFO: ["TRIAGED", "ENV_PREPARED", "STOPPED"],
  ENV_PREPARED: ["REPRO_RUNNING", "STOPPED"],
  REPRO_RUNNING: ["REPRODUCED", "NOT_REPRODUCED", "NEEDS_HUMAN_DECISION", "STOPPED"],
  REPRODUCED: ["REPORT_POSTED", "STOPPED"],
  NOT_REPRODUCED: ["REPORT_POSTED", "STOPPED"],
  REPORT_POSTED: ["WAITING_FOR_APPROVAL", "STOPPED"],
  WAITING_FOR_APPROVAL: ["FIX_RUNNING", "ENV_PREPARED", "STOPPED"],
  FIX_RUNNING: ["TESTING", "FIX_FAILED", "NEEDS_HUMAN_DECISION", "STOPPED"],
  TESTING: ["PR_CREATED", "FIX_FAILED", "STOPPED"],
  PR_CREATED: ["STOPPED"],
  FIX_FAILED: ["WAITING_FOR_APPROVAL", "STOPPED"],
  // A human must decide before work resumes; re-running /repro or /fix re-triages.
  NEEDS_HUMAN_DECISION: ["TRIAGED", "ENV_PREPARED", "STOPPED"],
  STOPPED: [],
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Historical approval marker kept for compatibility with persisted run state. */
export const APPROVAL_GATE: WorkflowState = "WAITING_FOR_APPROVAL";
