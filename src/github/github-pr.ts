import type { GitHubClient } from "./github-client.ts";
import { safeExec } from "../utils/safe-exec.ts";
import type { Logger } from "../utils/logger.ts";

const GIT_AUTHOR = {
  name: "Issue Repro & Fix Agent",
  email: "agent@reprokit.local",
};

/** Files changed in the working tree (porcelain status). */
export async function changedFiles(repoDir: string): Promise<string[]> {
  const res = await safeExec("git", ["status", "--porcelain"], {
    cwd: repoDir,
    timeoutMs: 30_000,
  });
  return res.stdout
    .split(/\r?\n/)
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

export interface CommitAndPushInput {
  repoDir: string;
  branchName: string;
  commitMessage: string;
  /** Authenticated push URL (contains token). Never logged raw. */
  pushUrl: string;
  logger?: Logger;
}

export interface CommitAndPushResult {
  pushed: boolean;
  branchName: string;
  filesChanged: string[];
  note?: string;
}

/**
 * Create a branch, commit all changes the worker made, and push to origin.
 * Returns pushed=false (without throwing) when there is nothing to commit.
 *
 * Safety: no force-push (blocked by safe-exec guard anyway). Token is passed
 * only on the push URL argument, never persisted to .git/config.
 */
export async function commitAndPush(
  input: CommitAndPushInput,
): Promise<CommitAndPushResult> {
  const { repoDir, branchName, commitMessage, pushUrl, logger } = input;

  const files = await changedFiles(repoDir);
  if (files.length === 0) {
    return { pushed: false, branchName, filesChanged: [], note: "No changes to commit." };
  }

  await safeExec("git", ["checkout", "-B", branchName], { cwd: repoDir, timeoutMs: 30_000 });
  await safeExec("git", ["add", "-A"], { cwd: repoDir, timeoutMs: 30_000 });

  const commit = await safeExec(
    "git",
    [
      "-c",
      `user.name=${GIT_AUTHOR.name}`,
      "-c",
      `user.email=${GIT_AUTHOR.email}`,
      "commit",
      "-m",
      commitMessage,
    ],
    { cwd: repoDir, timeoutMs: 30_000 },
  );
  if (commit.code !== 0) {
    return {
      pushed: false,
      branchName,
      filesChanged: files,
      note: `git commit failed: ${commit.stderr.slice(0, 300)}`,
    };
  }

  logger?.info("Pushing branch…", { branchName, fileCount: files.length });
  const push = await safeExec(
    "git",
    ["push", pushUrl, `HEAD:refs/heads/${branchName}`],
    { cwd: repoDir, timeoutMs: 2 * 60_000 },
  );
  if (push.code !== 0) {
    return {
      pushed: false,
      branchName,
      filesChanged: files,
      note: `git push failed: ${push.stderr.slice(0, 300)}`,
    };
  }

  return { pushed: true, branchName, filesChanged: files };
}

export interface OpenPrInput {
  client: GitHubClient;
  owner: string;
  repo: string;
  branchName: string;
  baseBranch: string;
  title: string;
  body: string;
}

export async function openPullRequest(
  input: OpenPrInput,
): Promise<{ url: string; number: number }> {
  const pr = await input.client.createPullRequest({
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    head: input.branchName,
    base: input.baseBranch,
    body: input.body,
  });
  return { url: pr.html_url, number: pr.number };
}

/** Build the PR body from the fix + reproduction context. */
export function buildPrBody(args: {
  issueNumber: number;
  issueUrl: string;
  bugSummary: string;
  reproductionSteps: string[];
  fixSummary: string;
  checks: string[];
  risks: string[];
}): string {
  const steps =
    args.reproductionSteps.length > 0
      ? args.reproductionSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "_See linked issue._";
  return `Closes #${args.issueNumber}

> Linked issue: ${args.issueUrl}

## Bug

${args.bugSummary}

## Reproduction steps

${steps}

## Fix

${args.fixSummary}

## Checks run

${args.checks.length ? args.checks.map((c) => `- \`${c}\``).join("\n") : "_None._"}

## Risks

${args.risks.length ? args.risks.map((r) => `- ${r}`).join("\n") : "_None reported._"}

---
🤖 Opened by the Issue Repro & Fix Agent after human approval. **Not auto-merged.**`;
}
