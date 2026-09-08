import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sanitizedEnv } from "@atrium/harness";

const execFileAsync = promisify(execFile);

export async function runProjectChecks(
  worktree: string,
): Promise<{ ok: boolean; excerpt: string }> {
  const pkgPath = join(worktree, "package.json");
  if (!existsSync(pkgPath)) {
    return { ok: true, excerpt: "No package.json; skipping project checks." };
  }
  let pkg: { scripts?: Record<string, string>; packageManager?: string };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
      packageManager?: string;
    };
  } catch {
    return { ok: false, excerpt: "package.json is not valid JSON." };
  }

  const script = ["test", "check", "typecheck", "lint"].find((name) => pkg.scripts?.[name]);
  if (!script) {
    return { ok: true, excerpt: "No test/check/typecheck/lint script; treating checks as passed." };
  }

  const usePnpm = existsSync(join(worktree, "pnpm-lock.yaml")) || Boolean(pkg.packageManager?.startsWith("pnpm"));
  const command = usePnpm ? "pnpm" : existsSync(join(worktree, "yarn.lock")) ? "yarn" : "npm";
  const args = command === "yarn" ? [script] : ["run", script];

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: worktree,
      env: sanitizedEnv(),
      timeout: 10 * 60_000,
      maxBuffer: 5_000_000,
    });
    return { ok: true, excerpt: `${stdout}\n${stderr}`.trim().slice(0, 8_000) };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      excerpt: `${err.stdout ?? ""}\n${err.stderr ?? err.message ?? "checks failed"}`.trim().slice(0, 8_000),
    };
  }
}
