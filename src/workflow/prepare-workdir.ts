import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { IssueContext } from "../types.js";
import { safeExec } from "../utils/safe-exec.js";
import {
  detectPackageManager,
  detectScripts,
  installArgs,
  type DetectedScripts,
  type PackageManager,
} from "../utils/package-manager.js";
import type { Logger } from "../utils/logger.js";

export interface PrepareWorkdirInput {
  issue: IssueContext;
  /** Target directory to clone into (the isolated checkout). */
  repoDir: string;
  /** Authenticated clone URL. Contains a token — never log it raw. */
  cloneUrl: string;
  /** Whether to run an install after clone. Default false (can be slow). */
  install?: boolean;
  logger?: Logger;
}

export interface PrepareWorkdirResult {
  repoDir: string;
  cloned: boolean;
  defaultBranch?: string;
  packageManager: PackageManager;
  scripts: DetectedScripts | null;
  installed: boolean;
}

/**
 * Clone the target repo into an isolated directory and inspect it. Workers run
 * against this checkout; the orchestrator never touches the user's machine repo.
 *
 * Safety: shallow clone, never on the main process repo, no destructive ops.
 */
export async function prepareWorkdir(
  input: PrepareWorkdirInput,
): Promise<PrepareWorkdirResult> {
  const { issue, repoDir, cloneUrl, install = false, logger } = input;
  const defaultBranch = issue.repository?.defaultBranch;

  let cloned = false;
  if (!existsSync(repoDir)) {
    mkdirSync(dirname(repoDir), { recursive: true });
    logger?.info("Cloning repository (shallow)…", { repoDir });
    const res = await safeExec(
      "git",
      ["clone", "--depth", "50", cloneUrl, repoDir],
      { timeoutMs: 5 * 60_000 },
    );
    if (res.code !== 0) {
      throw new Error(`git clone failed (exit ${res.code}). ${res.stderr.slice(0, 400)}`);
    }
    cloned = true;
  } else {
    logger?.info("Reusing existing checkout.", { repoDir });
  }

  if (defaultBranch) {
    // Best-effort checkout of the default branch; ignore failures.
    await safeExec("git", ["checkout", defaultBranch], { cwd: repoDir, timeoutMs: 60_000 }).catch(
      () => undefined,
    );
  }

  const packageManager = detectPackageManager(repoDir);
  const scripts = detectScripts(repoDir);

  let installed = false;
  if (install && scripts) {
    const { bin, args } = installArgs(packageManager);
    logger?.info(`Installing dependencies with ${packageManager}…`);
    const res = await safeExec(bin, args, { cwd: repoDir, timeoutMs: 10 * 60_000 }).catch(
      (e) => ({ code: 1, stderr: String(e), stdout: "", command: "", timedOut: false }),
    );
    installed = res.code === 0;
    if (!installed) logger?.warn("Dependency install failed; continuing without it.");
  }

  return { repoDir, cloned, defaultBranch, packageManager, scripts, installed };
}
