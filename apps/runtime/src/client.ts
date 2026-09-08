import type { ArtifactKind, HarnessId } from "@atrium/domain";

export type LeaseJob = {
  run: {
    id: string;
    pipeline: "bug_repro" | "bug_fix" | "spec_implement" | "compare";
    harness: HarnessId;
    status: string;
    phase: string | null;
    organizationId: string;
    ticketId: string | null;
    machineId: string | null;
    policySnapshot: { pauseAfterRepro?: boolean; concurrentRuns?: number };
  };
  ticket: {
    id: string;
    title: string;
    body: string;
    identifier: string;
    url: string;
    provider: "github" | "linear";
    externalId: string;
    kind: string;
  } | null;
  repo: {
    owner: string;
    repo: string;
    defaultBranch: string;
    cloneUrl: string;
  } | null;
  installationId: string | null;
  artifacts?: Array<{
    kind: ArtifactKind;
    excerpt: string;
    metadata?: Record<string, unknown> | null;
  }>;
  availableHarnesses?: HarnessId[];
};

export type CompleteBody = {
  runId: string;
  status: "pr_open" | "done" | "failed" | "cancelled" | "needs_info" | "awaiting_approval";
  errorSummary?: string | null;
  prUrl?: string | null;
  branchName?: string | null;
  questions?: string[];
};

export class ControlPlaneClient {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await this.fetchImpl(`${this.url.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    return response;
  }

  async heartbeat(capabilities: {
    harnesses: HarnessId[];
    loggedIn?: Partial<Record<HarnessId, boolean>>;
    versions?: Partial<Record<HarnessId, string>>;
    hostname?: string;
  }) {
    const response = await this.request("/runtime/heartbeat", {
      method: "POST",
      body: JSON.stringify({ capabilities }),
    });
    if (!response.ok) throw new Error(`heartbeat failed: ${response.status}`);
    return response.json();
  }

  async lease(harnesses: HarnessId[], waitMs = 25_000): Promise<LeaseJob | null> {
    const response = await this.request("/runtime/lease", {
      method: "POST",
      body: JSON.stringify({ harnesses }),
      signal: AbortSignal.timeout(waitMs + 5_000),
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`lease failed: ${response.status}`);
    const body = (await response.json()) as { job?: LeaseJob | null; run?: LeaseJob | null };
    return body.job ?? body.run ?? null;
  }

  async events(
    runId: string,
    events: Array<{ stream?: string; level?: string; message: string }>,
  ) {
    if (events.length === 0) return;
    const response = await this.request("/runtime/events", {
      method: "POST",
      body: JSON.stringify({ runId, events }),
    });
    if (!response.ok) throw new Error(`events failed: ${response.status}`);
  }

  async progress(runId: string, phase: "diagnosing" | "fixing" | "implementing" | "verifying") {
    await this.request("/runtime/progress", {
      method: "POST",
      body: JSON.stringify({ runId, phase }),
    });
  }

  async artifact(input: {
    runId: string;
    kind: ArtifactKind;
    excerpt: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.request("/runtime/artifacts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async complete(body: CompleteBody) {
    const response = await this.request("/runtime/complete", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`complete failed: ${response.status}`);
    return response.json();
  }

  async gitCredentials(runId: string): Promise<{
    token: string;
    cloneUrl: string;
    owner: string;
    repo: string;
    defaultBranch: string;
  }> {
    const response = await this.request("/runtime/git-credentials", {
      method: "POST",
      body: JSON.stringify({ runId }),
    });
    if (!response.ok) throw new Error(`git-credentials failed: ${response.status}`);
    return response.json() as Promise<{
      token: string;
      cloneUrl: string;
      owner: string;
      repo: string;
      defaultBranch: string;
    }>;
  }

  async openPr(input: { runId: string; branch: string; title: string; body: string }): Promise<{
    pr: { url: string; number: number };
  }> {
    const response = await this.request("/runtime/open-pr", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`open-pr failed: ${response.status}`);
    return response.json() as Promise<{ pr: { url: string; number: number } }>;
  }
}

export async function joinMachine(input: {
  url: string;
  code: string;
  name: string;
}): Promise<{ token: string; machineId: string }> {
  const response = await fetch(`${input.url.replace(/\/$/, "")}/runtime/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: input.code, name: input.name }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`join failed: ${response.status} ${text}`);
  }
  return response.json() as Promise<{ token: string; machineId: string }>;
}
