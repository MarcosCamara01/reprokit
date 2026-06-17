import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubProvider, readWorkerResult } from "../../src/tool-helpers.ts";
import { runPaths } from "../../src/utils/paths.ts";
import { commitAndPush, openPullRequest, buildPrBody } from "../../src/github/github-pr.ts";
import { logger } from "../../src/utils/logger.ts";
import type { FixWorkerResult } from "../../src/types.ts";

export default defineTool({
  description:
    "Commit the worker's changes onto branch agent/fix-issue-<n>, push it, and open " +
    "a pull request. ONLY call after run_project_checks passed. Never auto-merges. " +
    "Returns the PR URL.",
  inputSchema: z.object({
    number: z.number().int(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    checksRun: z.array(z.string()).optional().describe("Commands that passed."),
  }),
  async execute({ number, owner, repo, checksRun }) {
    const provider = githubProvider(owner, repo);
    const issue = await provider.getIssue(String(number));
    const key = issue.number ?? issue.id;
    const paths = runPaths(key);
    const client = provider.githubClient;
    const repoMeta = issue.repository!;

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

    const fix = readWorkerResult<FixWorkerResult>(key, "last-fix.json");
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
        fixSummary: fix?.summary ?? "See linked issue.",
        checks: checksRun ?? [],
        risks: fix?.risks ?? [],
      }),
    });

    return { pushed: true, prUrl: pr.url, prNumber: pr.number, filesChanged: push.filesChanged };
  },
});
