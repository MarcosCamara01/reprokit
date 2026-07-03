import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { githubProviderForTool, readWorkerResult } from "../../src/tool-helpers.ts";
import { runPaths } from "../../src/utils/paths.ts";
import { commitAndPush, openPullRequest, buildPrBody } from "../../src/github/github-pr.ts";
import { logger } from "../../src/utils/logger.ts";
import type {
  FixWorkerResult,
  ProjectChecksResult,
  ReproWorkerResult,
} from "../../src/types.ts";

export type CreateFixPrPreconditions =
  | {
      ok: true;
      fix: FixWorkerResult;
      checks: ProjectChecksResult;
      verification: ReproWorkerResult;
    }
  | { ok: false; reason: string };

export function evaluateCreateFixPrPreconditions(
  key: string | number,
): CreateFixPrPreconditions {
  const fix = readWorkerResult<FixWorkerResult>(key, "last-fix.json");
  if (!fix) {
    return {
      ok: false,
      reason: "No fix result found. Run run_fix_worker before create_fix_pr.",
    };
  }
  if (fix.hardStop) {
    return {
      ok: false,
      reason: `Fix worker stopped for human decision: ${fix.hardStop.reason}`,
    };
  }
  if (!fix.fixed) {
    return {
      ok: false,
      reason: "Fix worker did not produce a confirmed fix; PR creation is blocked.",
    };
  }

  const checks = readWorkerResult<ProjectChecksResult>(key, "last-checks.json");
  if (!checks) {
    return {
      ok: false,
      reason: "No project checks result found. Run run_project_checks before create_fix_pr.",
    };
  }
  if (!checks.success) {
    return {
      ok: false,
      reason: `Project checks failed at ${checks.failedCommand ?? "an unknown command"}; PR creation is blocked.`,
    };
  }

  const verification = readWorkerResult<ReproWorkerResult>(
    key,
    "last-post-fix-repro.json",
  );
  if (!verification) {
    return {
      ok: false,
      reason:
        "No post-fix verification result found. Run run_repro_worker with phase='post-fix' before create_fix_pr.",
    };
  }
  if (verification.hardStop) {
    return {
      ok: false,
      reason: `Post-fix verification stopped for human decision: ${verification.hardStop.reason}`,
    };
  }
  if (verification.reproduced) {
    return {
      ok: false,
      reason:
        "Post-fix verification still reproduces the bug; PR creation is blocked.",
    };
  }

  return { ok: true, fix, checks, verification };
}

export default defineTool({
  description:
    "Commit the worker's changes onto branch agent/fix-issue-<n>, push it, and open " +
    "a pull request. ONLY call after run_fix_worker fixed the issue, run_project_checks " +
    "passed, and run_repro_worker phase='post-fix' no longer reproduces the bug. " +
    "Never auto-merges. Returns the PR URL.",
  inputSchema: z.object({
    number: z.number().int(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    checksRun: z.array(z.string()).optional().describe("Commands that passed."),
  }),
  approval: always(),
  async execute({ number, owner, repo, checksRun }, ctx) {
    const provider = await githubProviderForTool(ctx, owner, repo);
    const issue = await provider.getIssue(String(number));
    const key = issue.number ?? issue.id;
    const paths = runPaths(key);
    const client = provider.githubClient;
    const repoMeta = issue.repository!;

    const preconditions = evaluateCreateFixPrPreconditions(key);
    if (!preconditions.ok) {
      return {
        pushed: false,
        blocked: true,
        note: preconditions.reason,
        prUrl: null,
      };
    }

    const branchName = `agent/fix-issue-${issue.number ?? issue.id}`;
    const push = await commitAndPush({
      repoDir: paths.repo,
      branchName,
      commitMessage: `fix: resolve issue #${issue.number}`,
      pushUrl: client.authedRemoteUrl(repoMeta.owner, repoMeta.name),
      logger,
    });
    if (!push.pushed) {
      return { pushed: false, note: push.note, prUrl: null };
    }

    const pr = await openPullRequest({
      client,
      owner: repoMeta.owner,
      repo: repoMeta.name,
      branchName,
      baseBranch: repoMeta.defaultBranch ?? "main",
      title: `fix: ${issue.title}`,
      body: buildPrBody({
        issueNumber: issue.number!,
        issueUrl: issue.url,
        bugSummary: issue.parsedBug.summary,
        reproductionSteps: issue.parsedBug.reproductionSteps,
        fixSummary: preconditions.fix.summary,
        checks: checksRun ?? preconditions.checks.commandsRun,
        risks: preconditions.fix.risks,
      }),
    });

    return { pushed: true, prUrl: pr.url, prNumber: pr.number, filesChanged: push.filesChanged };
  },
});
