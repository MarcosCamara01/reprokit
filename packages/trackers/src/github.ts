import type { TicketRef, TicketSnapshot } from "@atrium/domain";
import type { IssueTracker } from "./types";
import { TrackerNotImplementedError } from "./types";

export type GitHubTrackerOptions = {
  token?: string;
  owner?: string;
  repo?: string;
  fetch?: typeof fetch;
  apiUrl?: string;
};

/**
 * GitHub tracker. Intake still goes webhook → AgentRun.
 * Comments / PR links need an installation (or PAT) token.
 */
export class GitHubTracker implements IssueTracker {
  readonly id = "github" as const;
  private readonly snapshots = new Map<string, TicketSnapshot>();

  constructor(private readonly options: GitHubTrackerOptions = {}) {}

  remember(snapshot: TicketSnapshot): void {
    this.snapshots.set(key(snapshot.ref), snapshot);
  }

  async getIssue(ref: TicketRef): Promise<TicketSnapshot> {
    const found = this.snapshots.get(key(ref));
    if (found) return found;
    if (!this.options.token) {
      throw new TrackerNotImplementedError(
        "github",
        "getIssue (GitHub App token not wired)",
      );
    }
    const { owner, repo } = this.requireRepo();
    const number = issueNumber(ref);
    const response = await this.request(
      `/repos/${owner}/${repo}/issues/${number}`,
      { method: "GET" },
    );
    const issue = (await response.json()) as {
      id?: number;
      number?: number;
      title?: string;
      body?: string | null;
      html_url?: string;
      labels?: Array<string | { name?: string }>;
    };
    return {
      ref: {
        provider: "github",
        externalId: String(issue.id ?? ref.externalId),
        identifier: `#${issue.number ?? number}`,
      },
      url: issue.html_url ?? "",
      title: issue.title ?? ref.identifier,
      body: issue.body ?? "",
      kind: "unknown",
      labels: (issue.labels ?? [])
        .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
        .filter(Boolean),
    };
  }

  async postComment(ref: TicketRef, body: string): Promise<void> {
    if (!this.options.token) {
      throw new TrackerNotImplementedError("github", "postComment");
    }
    const { owner, repo } = this.requireRepo();
    const number = issueNumber(ref);
    await this.request(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async requestInfo(ref: TicketRef, questions: string[]): Promise<void> {
    await this.postComment(
      ref,
      ["Need more information:", ...questions.map((q) => `- ${q}`)].join("\n"),
    );
  }

  async linkPr(
    ref: TicketRef,
    pr: { url: string; title: string; runUrl?: string },
  ): Promise<void> {
    const extra = pr.runUrl ? `\n\nAtrium run: ${pr.runUrl}` : "";
    await this.postComment(ref, `Opened [${pr.title}](${pr.url})${extra}`);
  }

  async applyLabels(ref: TicketRef, labels: string[]): Promise<void> {
    if (!this.options.token) {
      throw new TrackerNotImplementedError("github", "applyLabels");
    }
    const { owner, repo } = this.requireRepo();
    const number = issueNumber(ref);
    await this.request(`/repos/${owner}/${repo}/issues/${number}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels }),
    });
  }

  async postCommentOnRepo(input: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }): Promise<void> {
    await this.request(
      `/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body: input.body }),
      },
    );
  }

  /** Opens a PR. Never merge — Atrium stops at pr_open. */
  async openPullRequest(input: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<{ url: string; number: number }> {
    const response = await this.request(`/repos/${input.owner}/${input.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
      }),
    });
    const pr = (await response.json()) as { html_url?: string; number?: number };
    if (!pr.html_url || !pr.number) {
      throw new Error("GitHub did not return a pull request URL");
    }
    return { url: pr.html_url, number: pr.number };
  }

  private requireRepo(): { owner: string; repo: string } {
    const owner = this.options.owner?.trim();
    const repo = this.options.repo?.trim();
    if (!owner || !repo) {
      throw new TrackerNotImplementedError("github", "repo (owner/repo missing)");
    }
    return { owner, repo };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const fetchFn = this.options.fetch ?? fetch;
    const base = this.options.apiUrl ?? "https://api.github.com";
    const response = await fetchFn(`${base}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${this.options.token}`,
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API ${path} failed (${response.status})`);
    }
    return response;
  }
}

function key(ref: TicketRef): string {
  return `${ref.provider}:${ref.externalId}`;
}

function issueNumber(ref: TicketRef): string {
  return ref.identifier.replace(/^#/, "");
}
