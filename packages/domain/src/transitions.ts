import type { AgentRunPhase, AgentRunStatus, Pipeline } from "./catalog";

const ALLOWED: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  needs_info: ["queued", "awaiting_approval", "cancelled"],
  awaiting_approval: ["queued", "needs_info", "cancelled"],
  queued: ["running", "needs_info", "awaiting_approval", "cancelled"],
  running: [
    "pr_open",
    "done",
    "failed",
    "cancelled",
    "needs_info",
    "awaiting_approval",
  ],
  pr_open: ["done", "failed", "cancelled"],
  done: [],
  failed: ["queued", "cancelled"],
  cancelled: [],
};

export function allowedTransitions(from: AgentRunStatus): AgentRunStatus[] {
  return [...ALLOWED[from]];
}

export function canTransition(from: AgentRunStatus, to: AgentRunStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: AgentRunStatus, to: AgentRunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal AgentRun transition: ${from} → ${to}`);
  }
}

const PHASE_BY_PIPELINE: Record<Pipeline, readonly AgentRunPhase[]> = {
  bug_repro: ["diagnosing"],
  bug_fix: ["diagnosing", "fixing", "verifying"],
  spec_implement: ["implementing", "verifying"],
  compare: ["diagnosing"],
};

export function phasesForPipeline(pipeline: Pipeline): AgentRunPhase[] {
  return [...PHASE_BY_PIPELINE[pipeline]];
}

export function isPhaseAllowed(
  pipeline: Pipeline,
  phase: AgentRunPhase | null,
  status: AgentRunStatus,
): boolean {
  if (status !== "running") return phase === null;
  if (phase === null) return false;
  return PHASE_BY_PIPELINE[pipeline].includes(phase);
}

export function nextPhase(
  pipeline: Pipeline,
  current: AgentRunPhase | null,
): AgentRunPhase | null {
  const phases = PHASE_BY_PIPELINE[pipeline];
  if (current === null) return phases[0] ?? null;
  const idx = phases.indexOf(current);
  if (idx < 0 || idx === phases.length - 1) return current;
  return phases[idx + 1] ?? current;
}
