/**
 * Small helpers shared by the Eve `agent/tools/*` wrappers. Kept in `src/` (not
 * under `agent/tools/`) so Eve doesn't mistake it for a tool file.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadLocalEnv } from "./utils/load-env.ts";
import { GitHubIssueProvider } from "./providers/github-provider.ts";
import { ensureRunDirs, runPaths } from "./utils/paths.ts";

loadLocalEnv();

export function githubProvider(owner?: string, repo?: string): GitHubIssueProvider {
  return GitHubIssueProvider.fromEnv(owner, repo);
}

/** Persist a worker result so a later tool/turn can read it (durable handoff). */
export function persistWorkerResult(
  key: string | number,
  name: "last-repro.json" | "last-fix.json",
  value: unknown,
): string {
  const paths = runPaths(key);
  ensureRunDirs(paths);
  const file = join(paths.workerOutput, name);
  writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

export function readWorkerResult<T>(
  key: string | number,
  name: "last-repro.json" | "last-fix.json",
): T | null {
  const file = join(runPaths(key).workerOutput, name);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}
