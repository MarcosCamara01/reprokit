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
  "STOPPED",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/**
 * Allowed transitions. Kept permissive on purpose (an issue can be re-triaged,
 * re-reproduced, etc.) but encodes the important guard: you cannot enter a FIX
 * state without first having WAITING_FOR_APPROVAL (human-in-the-loop).
 */
const TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  NEW_ISSUE: ["TRIAGED", "STOPPED"],
  TRIAGED: ["NEEDS_MORE_INFO", "ENV_PREPARED", "STOPPED"],
  NEEDS_MORE_INFO: ["TRIAGED", "ENV_PREPARED", "STOPPED"],
  ENV_PREPARED: ["REPRO_RUNNING", "STOPPED"],
  REPRO_RUNNING: ["REPRODUCED", "NOT_REPRODUCED", "STOPPED"],
  REPRODUCED: ["REPORT_POSTED", "STOPPED"],
  NOT_REPRODUCED: ["REPORT_POSTED", "STOPPED"],
  REPORT_POSTED: ["WAITING_FOR_APPROVAL", "STOPPED"],
  WAITING_FOR_APPROVAL: ["FIX_RUNNING", "ENV_PREPARED", "STOPPED"],
  FIX_RUNNING: ["TESTING", "FIX_FAILED", "STOPPED"],
  TESTING: ["PR_CREATED", "FIX_FAILED", "STOPPED"],
  PR_CREATED: ["STOPPED"],
  FIX_FAILED: ["WAITING_FOR_APPROVAL", "STOPPED"],
  STOPPED: [],
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** The state that gates code modification. Fixing requires having reached this. */
export const APPROVAL_GATE: WorkflowState = "WAITING_FOR_APPROVAL";
