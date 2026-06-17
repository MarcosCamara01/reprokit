import type { ProjectChecksResult } from "../types.js";
import {
  detectPackageManager,
  detectScripts,
  runScriptArgs,
  type DetectedScripts,
} from "../utils/package-manager.js";
import { safeExec } from "../utils/safe-exec.js";
import { redactAndTruncate } from "../utils/redact-secrets.js";
import type { Logger } from "../utils/logger.js";

/** Order in which checks run after a fix. Stops at the first failure. */
const CHECK_ORDER: Array<keyof Omit<DetectedScripts, "all">> = [
  "typecheck",
  "lint",
  "test",
  "build",
  // e2e/playwright are intentionally NOT run by default (slow, flaky, need browsers).
];

export interface RunChecksOptions {
  repoDir: string;
  timeoutMsPerCheck?: number;
  maxLogChars?: number;
  logger?: Logger;
  /** Override which checks to run (defaults to CHECK_ORDER ∩ available scripts). */
  only?: Array<keyof Omit<DetectedScripts, "all">>;
}

/**
 * Run the relevant project checks against the (fixed) checkout. Returns a
 * structured result; never throws on a failing check (only on infra errors).
 */
export async function runProjectChecks(
  opts: RunChecksOptions,
): Promise<ProjectChecksResult> {
  const {
    repoDir,
    timeoutMsPerCheck = 5 * 60_000,
    maxLogChars = 8000,
    logger,
  } = opts;

  const pm = detectPackageManager(repoDir);
  const scripts = detectScripts(repoDir);
  const commandsRun: string[] = [];
  const logs: string[] = [];

  if (!scripts) {
    return {
      success: true,
      commandsRun: [],
      logs: ["No package.json found — skipping project checks."],
    };
  }

  const checks = (opts.only ?? CHECK_ORDER).filter((c) => scripts[c]);
  if (checks.length === 0) {
    return {
      success: true,
      commandsRun: [],
      logs: ["No typecheck/lint/test/build scripts detected — skipping."],
    };
  }

  for (const check of checks) {
    const scriptName = scripts[check]!;
    const { bin, args } = runScriptArgs(pm, scriptName);
    const cmd = `${bin} ${args.join(" ")}`;
    commandsRun.push(cmd);
    logger?.info(`Running check: ${check} (${cmd})`);

    const res = await safeExec(bin, args, { cwd: repoDir, timeoutMs: timeoutMsPerCheck });
    const tail = redactAndTruncate(
      `${res.stdout}\n${res.stderr}`.trim(),
      maxLogChars,
    );
    logs.push(`### ${check}: ${cmd}\n${tail}`);

    if (res.timedOut || res.code !== 0) {
      return { success: false, commandsRun, failedCommand: cmd, logs };
    }
  }

  return { success: true, commandsRun, logs };
}
