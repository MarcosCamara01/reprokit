import { existsSync, readdirSync } from "node:fs";
import { RUNS_ROOT } from "../utils/paths.ts";
import { loadRunState } from "./run-store.ts";

export interface StaleRun {
  issueKey: string;
  state: string;
  updatedAt?: string;
  url?: string;
}

/**
 * Find runs that are parked waiting for human approval (or otherwise idle).
 * `olderThanMs` filters by the persisted `updatedAt` when provided.
 *
 * `nowMs` is injected so this is deterministic and testable (no hidden clock).
 */
export function findStaleRuns(olderThanMs?: number, nowMs?: number): StaleRun[] {
  if (!existsSync(RUNS_ROOT)) return [];
  const out: StaleRun[] = [];

  for (const entry of readdirSync(RUNS_ROOT)) {
    const match = entry.match(/^issue-(.+)$/);
    if (!match) continue;
    const issueKey = match[1]!;
    const state = loadRunState(issueKey);
    if (!state) continue;
    if (state.state !== "WAITING_FOR_APPROVAL" && state.state !== "FIX_FAILED") continue;

    if (olderThanMs && nowMs && state.updatedAt) {
      const age = nowMs - Date.parse(state.updatedAt);
      if (Number.isFinite(age) && age < olderThanMs) continue;
    }

    out.push({
      issueKey,
      state: state.state,
      updatedAt: state.updatedAt,
      url: state.issue.url,
    });
  }
  return out;
}
