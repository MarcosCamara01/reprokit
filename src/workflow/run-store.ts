import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureRunDirs, runPaths } from "../utils/paths.ts";
import type { WorkflowState } from "./states.ts";

export interface RunStateFile {
  issue: {
    provider: string;
    owner?: string;
    repo?: string;
    id: string;
    number?: number;
    url?: string;
    title?: string;
  };
  state: WorkflowState;
  worker?: string;
  reportPath?: string;
  prUrl?: string;
  branchName?: string;
  history: Array<{ state: WorkflowState; note?: string }>;
  /** ISO timestamp injected by the caller (kept out of the store for determinism). */
  updatedAt?: string;
}

/** Read the persisted state for an issue, or null if none exists yet. */
export function loadRunState(issueKey: string | number): RunStateFile | null {
  const p = runPaths(issueKey);
  if (!existsSync(p.state)) return null;
  try {
    return JSON.parse(readFileSync(p.state, "utf8")) as RunStateFile;
  } catch {
    return null;
  }
}

/** Persist state, creating the run directory structure if needed. */
export function saveRunState(
  issueKey: string | number,
  state: RunStateFile,
): void {
  const p = runPaths(issueKey);
  ensureRunDirs(p);
  writeFileSync(p.state, JSON.stringify(state, null, 2));
}

/** Transition helper that appends to history and persists. */
export function setState(
  issueKey: string | number,
  current: RunStateFile,
  next: WorkflowState,
  note?: string,
  now?: string,
): RunStateFile {
  const updated: RunStateFile = {
    ...current,
    state: next,
    history: [...current.history, { state: next, note }],
    updatedAt: now,
  };
  saveRunState(issueKey, updated);
  return updated;
}
