import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { gitAuthEnv, sanitizedEnv } from "@atrium/harness";
import { branchName, cacheDir, runDir } from "./config";

const execFileAsync = promisify(execFile);

export async function git(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = sanitizedEnv(),
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd, env, maxBuffer: 20_000_000 });
}

export function assertCleanRemoteUrl(url: string): void {
  if (/ghp_|gho_|github_pat_|x-access-token:|:[^/@]+@/.test(url)) {
    throw new Error("refusing to persist a token in a git remote URL");
  }
}

export async function prepareWorktree(input: {
  home: string;
  runId: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  defaultBranch: string;
  pipeline: string;
  identifier: string;
  token: string;
  suffix?: string;
}): Promise<{ worktree: string; branch: string; cache: string }> {
  assertCleanRemoteUrl(input.cloneUrl);
  const cache = cacheDir(input.home, input.owner, input.repo);
  const worktree = runDir(input.home, input.runId, input.suffix);
  const branch = branchName(input.pipeline, input.identifier, input.runId);
  const env = gitAuthEnv(input.token);

  mkdirSync(dirname(cache), { recursive: true });
  mkdirSync(dirname(worktree), { recursive: true });

  try {
    await git(["rev-parse", "--is-bare-repository"], cache, env);
    await git(["remote", "set-url", "origin", input.cloneUrl], cache, sanitizedEnv());
  } catch {
    await git(["clone", "--bare", input.cloneUrl, cache], dirname(cache), env);
    await git(["remote", "set-url", "origin", input.cloneUrl], cache, sanitizedEnv());
  }
  await git(
    ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
    cache,
    sanitizedEnv(),
  );
  await git(["fetch", "origin", "--prune"], cache, env);

  const originRef = await resolveBaseRef(cache, input.defaultBranch, env);

  try {
    await git(
      ["worktree", "add", "-B", branch, worktree, originRef],
      cache,
      env,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("already exists") && !message.includes("already used")) {
      throw error;
    }
  }

  await git(["remote", "set-url", "origin", input.cloneUrl], worktree, sanitizedEnv());
  return { worktree, branch, cache };
}

export async function hasCommitsAhead(worktree: string, defaultBranch: string): Promise<boolean> {
  for (const base of [`origin/${defaultBranch}`, defaultBranch]) {
    try {
      const { stdout } = await git(["rev-list", "--count", `${base}..HEAD`], worktree);
      return Number(stdout.trim()) > 0;
    } catch {
      continue;
    }
  }
  return false;
}

export async function commitIfDirty(worktree: string, message: string): Promise<boolean> {
  const { stdout } = await git(["status", "--porcelain"], worktree);
  if (!stdout.trim()) return false;
  await git(["add", "-A"], worktree);
  await git(["-c", "user.email=atrium@local", "-c", "user.name=Atrium", "commit", "-m", message], worktree);
  return true;
}

export async function pushBranch(input: {
  worktree: string;
  branch: string;
  token: string;
  cloneUrl: string;
}): Promise<void> {
  assertCleanRemoteUrl(input.cloneUrl);
  await git(["remote", "set-url", "origin", input.cloneUrl], input.worktree, sanitizedEnv());
  const env = gitAuthEnv(input.token);
  await git(["push", "origin", `HEAD:refs/heads/${input.branch}`], input.worktree, env);
}

async function resolveBaseRef(
  cache: string,
  defaultBranch: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const candidates = [
    `origin/${defaultBranch}`,
    defaultBranch,
    `refs/heads/${defaultBranch}`,
  ];
  for (const ref of candidates) {
    try {
      await git(["rev-parse", "--verify", ref], cache, env);
      return ref;
    } catch {
      continue;
    }
  }
  throw new Error(`default branch ${defaultBranch} is missing after fetch`);
}

export async function collectDiffStat(worktree: string, defaultBranch: string): Promise<string> {
  try {
    const { stdout } = await git(["diff", "--stat", `origin/${defaultBranch}...HEAD`], worktree);
    return stdout.trim();
  } catch {
    return "";
  }
}

export function resolveInsideWorktree(worktree: string, relativePath: string): string {
  const root = resolve(worktree);
  const abs = resolve(worktree, relativePath);
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..") || rel === "..") {
    throw new Error("path escapes the worktree");
  }
  return abs;
}

export function writeSpecCopy(worktree: string, relativePath: string, markdown: string): string {
  const abs = resolveInsideWorktree(worktree, relativePath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
  return relativePath;
}

export async function changedPaths(worktree: string, defaultBranch: string): Promise<string[]> {
  for (const base of [`origin/${defaultBranch}...HEAD`, `${defaultBranch}...HEAD`]) {
    try {
      const { stdout } = await git(["diff", "--name-only", base], worktree);
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      continue;
    }
  }
  return [];
}

export function isSpecOnlyDiff(paths: string[]): boolean {
  return paths.length > 0 && paths.every((path) => path.replace(/\\/g, "/").startsWith("specs/"));
}
