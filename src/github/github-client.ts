/**
 * Minimal GitHub REST client built on global `fetch` (Node 18+), so the MVP has
 * no SDK dependency. Authenticates with either a GitHub App installation token
 * (native Eve GitHub channel path) or a personal access token (legacy fallback).
 */

import { createSign } from "node:crypto";

const API = "https://api.github.com";

export interface GitHubClientOptions {
  token: string;
  baseUrl?: string;
  userAgent?: string;
}

export interface CreateGitHubAppJwtInput {
  appId: string | number;
  privateKey: string;
  now?: Date;
}

export interface GitHubAppInstallationClientOptions extends CreateGitHubAppJwtInput {
  installationId: string | number;
  baseUrl?: string;
  fetch?: typeof fetch;
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

export function normalizeGitHubPrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createGitHubAppJwt(input: CreateGitHubAppJwtInput): string {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: String(input.appId),
  });
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(normalizeGitHubPrivateKey(input.privateKey))
    .toString("base64url");
  return `${unsigned}.${signature}`;
}

export async function githubClientFromGitHubAppInstallation(
  opts: GitHubAppInstallationClientOptions,
): Promise<GitHubClient> {
  const baseUrl = opts.baseUrl ?? API;
  const userAgent = opts.userAgent ?? "reprokit-issue-agent";
  const jwt = createGitHubAppJwt(opts);
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(
    `${baseUrl}/app/installations/${opts.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": userAgent,
      },
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GitHub App installation token request failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`,
    );
  }

  const body = (await res.json()) as { token?: string };
  if (!body.token) {
    throw new Error("GitHub App installation token response did not include a token.");
  }

  return new GitHubClient({ token: body.token, baseUrl, userAgent });
}

export function hasGitHubAppEnv(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

export async function githubClientFromEnvOrGitHubApp(
  installationId?: string | number | null,
): Promise<GitHubClient> {
  if (installationId && hasGitHubAppEnv()) {
    return githubClientFromGitHubAppInstallation({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
      installationId,
    });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GitHub auth is not configured. For Eve GitHub channel runs, set " +
        "GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY and provide an installation id; " +
        "for the standalone fallback, set GITHUB_TOKEN.",
    );
  }
  return new GitHubClient({ token });
}
