import { GitHubClient, githubClientFromEnv } from "./github/github-client.js";
import { GitHubIssueProvider } from "./providers/github-provider.js";
import { IssueWorkflow, type WorkflowConfig } from "./workflow/issue-workflow.js";
import type { IssueContext } from "./types.js";

/**
 * Build a fully-wired GitHub workflow (provider + git access + PR client).
 * This is the single composition root reused by the webhook, the CLI and the
 * Eve tools.
 */
export function buildGitHubWorkflow(
  owner: string,
  repo: string,
  config?: Partial<WorkflowConfig>,
): IssueWorkflow {
  const client: GitHubClient = githubClientFromEnv();
  const provider = new GitHubIssueProvider({ owner, repo, client });

  return new IssueWorkflow({
    provider,
    client,
    resolveGitUrl: (issue: IssueContext) =>
      client.authedRemoteUrl(
        issue.repository?.owner ?? owner,
        issue.repository?.name ?? repo,
      ),
    config,
  });
}
