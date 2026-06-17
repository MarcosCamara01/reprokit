import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Filesystem layout for per-issue agent runs:
 *
 *   .runs/
 *     issue-<number>/
 *       state.json
 *       repo/                 (single-worker checkout)
 *       logs/
 *       screenshots/
 *       worker-output/
 *       report.md
 *       codex/repo/           (compare mode)
 *       claude/repo/          (compare mode)
 */

export const RUNS_ROOT = resolve(process.cwd(), ".runs");

export interface RunPaths {
  root: string;
  state: string;
  repo: string;
  logs: string;
  screenshots: string;
  workerOutput: string;
  report: string;
  /** Per-worker isolated checkout (used by `/compare` and to keep workers apart). */
  workerRepo(worker: string): string;
  workerDir(worker: string): string;
}

export function runPaths(issueKey: string | number): RunPaths {
  const root = join(RUNS_ROOT, `issue-${issueKey}`);
  return {
    root,
    state: join(root, "state.json"),
    repo: join(root, "repo"),
    logs: join(root, "logs"),
    screenshots: join(root, "screenshots"),
    workerOutput: join(root, "worker-output"),
    report: join(root, "report.md"),
    workerDir: (worker: string) => join(root, worker),
    workerRepo: (worker: string) => join(root, worker, "repo"),
  };
}

/** Create the standard subdirectories for a run. Idempotent. */
export function ensureRunDirs(paths: RunPaths): void {
  for (const dir of [
    paths.root,
    paths.logs,
    paths.screenshots,
    paths.workerOutput,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}
