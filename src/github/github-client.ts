/**
 * Minimal GitHub REST client built on global `fetch` (Node 18+), so the MVP has
 * no SDK dependency. Authenticates with a personal access token (GITHUB_TOKEN).
 *
 * TODO(github-app): swap token auth for a GitHub App installation token when
 * GITHUB_APP_ID / GITHUB_PRIVATE_KEY are configured. The call sites below only
 * depend on `authHeader()`, so this is a localized change.
 */

const API = "https://api.github.com";

export interface GitHubClientOptions {
  token: string;
  baseUrl?: string;
  userAgent?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: Array<{ name: string } | string>;
  user: { login: string } | null;
  pull_request?: unknown;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
}

export interface GitHubRepo {
  default_branch: string;
  clone_url: string;
  owner: { login: string };
  name: string;
}

export interface CreatePullRequestInput {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
  draft?: boolean;
}

export interface PullRequest {
  number: number;
  html_url: string;
}

export class GitHubClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(opts: GitHubClientOptions) {
    if (!opts.token) throw new Error("GitHubClient requires a token (GITHUB_TOKEN).");
    this.token = opts.token;
    this.baseUrl = opts.baseUrl ?? API;
    this.userAgent = opts.userAgent ?? "reprokit-issue-agent";
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": this.userAgent,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `GitHub ${method} ${path} failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`,
      );
    }
    // Some endpoints (204) have no body.
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request("GET", `/repos/${owner}/${repo}`);
  }

  getIssue(owner: string, repo: string, number: number): Promise<GitHubIssue> {
    return this.request("GET", `/repos/${owner}/${repo}/issues/${number}`);
  }

  listIssueComments(
    owner: string,
    repo: string,
    number: number,
  ): Promise<GitHubComment[]> {
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
    );
  }

  createIssueComment(
    owner: string,
    repo: string,
    number: number,
    body: string,
  ): Promise<GitHubComment> {
    return this.request("POST", `/repos/${owner}/${repo}/issues/${number}/comments`, {
      body,
    });
  }

  createPullRequest(input: CreatePullRequestInput): Promise<PullRequest> {
    const { owner, repo, ...rest } = input;
    return this.request("POST", `/repos/${owner}/${repo}/pulls`, rest);
  }

  /** Authenticated clone/push URL. NOTE: contains the token — never log it raw. */
  authedRemoteUrl(owner: string, repo: string): string {
    return `https://x-access-token:${this.token}@github.com/${owner}/${repo}.git`;
  }
}

/** Construct a client from env, or throw a clear, actionable error. */
export function githubClientFromEnv(): GitHubClient {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not set. Create a token with `repo` scope and add it to .env " +
        "(see .env.example). GitHub App auth is designed-for but not required in the MVP.",
    );
  }
  return new GitHubClient({ token });
}
