import type { IssueContext, IssueComment } from "../types.ts";
import { GitHubClient, githubClientFromEnv } from "../github/github-client.ts";
import type { IssueProvider } from "./issue-provider.ts";
import { parseBug } from "./parse-bug.ts";

export interface GitHubProviderConfig {
  owner: string;
  repo: string;
  client?: GitHubClient;
}

/**
 * GitHub-backed IssueProvider. `id` is the issue number (as a string).
 * This is the only fully-implemented provider in the MVP.
 */
export class GitHubIssueProvider implements IssueProvider {
  readonly id = "github" as const;
  private readonly owner: string;
  private readonly repo: string;
  private readonly client: GitHubClient;

  constructor(config: GitHubProviderConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.client = config.client ?? githubClientFromEnv();
  }

  static fromEnv(owner?: string, repo?: string): GitHubIssueProvider {
    const o = owner ?? process.env.GITHUB_OWNER;
    const r = repo ?? process.env.GITHUB_REPO;
    if (!o || !r) {
      throw new Error(
        "GitHub owner/repo not provided. Pass them explicitly or set GITHUB_OWNER / GITHUB_REPO.",
      );
    }
    return new GitHubIssueProvider({ owner: o, repo: r });
  }

  async getIssue(id: string): Promise<IssueContext> {
    const number = Number(id);
    if (!Number.isInteger(number)) {
      throw new Error(`Invalid GitHub issue id: ${id}`);
    }

    const [issue, repo, rawComments] = await Promise.all([
      this.client.getIssue(this.owner, this.repo, number),
      this.client.getRepo(this.owner, this.repo).catch(() => undefined),
      this.client.listIssueComments(this.owner, this.repo, number).catch(() => []),
    ]);

    const labels = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
    const body = issue.body ?? "";

    const comments: IssueComment[] = rawComments.map((c) => ({
      id: String(c.id),
      author: c.user?.login ?? "unknown",
      body: c.body ?? "",
      createdAt: c.created_at,
    }));

    return {
      provider: "github",
      id,
      number,
      url: issue.html_url,
      title: issue.title,
      body,
      labels,
      comments,
      repository: repo
        ? {
            owner: this.owner,
            name: this.repo,
            defaultBranch: repo.default_branch,
            cloneUrl: repo.clone_url,
          }
        : { owner: this.owner, name: this.repo },
      parsedBug: parseBug(issue.title, body),
    };
  }

  async postComment(id: string, body: string): Promise<void> {
    await this.client.createIssueComment(this.owner, this.repo, Number(id), body);
  }

  async createLinkedPr(id: string, prUrl: string): Promise<void> {
    // GitHub auto-links PRs that reference the issue in their body, so this just
    // leaves a breadcrumb comment. Real linking happens via PR body "Closes #N".
    await this.postComment(id, `🔗 Linked pull request: ${prUrl}`);
  }

  /** Expose the underlying client for the PR/git helpers. */
  get githubClient(): GitHubClient {
    return this.client;
  }

  get repoCoords(): { owner: string; repo: string } {
    return { owner: this.owner, repo: this.repo };
  }
}
