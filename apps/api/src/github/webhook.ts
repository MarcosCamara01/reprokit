import type { TicketKind } from "@atrium/domain";
import {
  cancelActiveRunsForTicket,
  findRepoBinding,
  getDb,
  getOrgOwner,
  isDatabaseConfigured,
  markPrMerged,
  upsertGithubInstallation,
  upsertTicket,
} from "@atrium/db";
import { GitHubTracker } from "@atrium/trackers";
import { enqueueAgentRun } from "../intake/enqueue-run";
import { parseSlashCommand } from "./parse-command";
import { verifyGitHubSignature } from "./signature";

export type GitHubWebhookResult =
  | { ok: true; ignored: string }
  | { ok: true; runId: string; status: string }
  | { ok: true; cancelled: number }
  | { ok: false; error: string; status: number };

type GitHubUser = { login?: string };
type GitHubRepo = { full_name?: string; owner?: { login?: string }; name?: string };
type GitHubIssue = {
  id?: number;
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  labels?: Array<string | { name?: string }>;
  user?: GitHubUser;
};
type GitHubComment = { body?: string | null; user?: GitHubUser };
type GitHubPullRequest = {
  html_url?: string;
  merged?: boolean;
  number?: number;
};

export type GitHubWebhookPayload = {
  action?: string;
  installation?: { id?: number };
  repository?: GitHubRepo;
  issue?: GitHubIssue;
  comment?: GitHubComment;
  pull_request?: GitHubPullRequest;
};

const tracker = new GitHubTracker();

export async function handleGitHubWebhook(input: {
  rawBody: string;
  signature: string | null;
  event: string | null;
  secret: string;
}): Promise<GitHubWebhookResult> {
  if (!verifyGitHubSignature(input.rawBody, input.signature, input.secret)) {
    return { ok: false, error: "invalid signature", status: 401 };
  }

  let payload: GitHubWebhookPayload;
  try {
    payload = JSON.parse(input.rawBody) as GitHubWebhookPayload;
  } catch {
    return { ok: false, error: "invalid json", status: 400 };
  }

  if (input.event === "ping") {
    return { ok: true, ignored: "ping" };
  }

  if (input.event === "issue_comment" && payload.action === "created") {
    return handleIssueComment(payload);
  }

  if (input.event === "pull_request" && payload.action === "closed") {
    if (payload.pull_request?.merged && payload.pull_request.html_url && isDatabaseConfigured()) {
      const updated = await markPrMerged(getDb(), payload.pull_request.html_url);
      if (updated) return { ok: true, runId: updated.id, status: "done" };
    }
    return { ok: true, ignored: "pr closed" };
  }

  return { ok: true, ignored: `${input.event ?? "unknown"}:${payload.action ?? ""}` };
}

async function handleIssueComment(
  payload: GitHubWebhookPayload,
): Promise<GitHubWebhookResult> {
  const command = parseSlashCommand(payload.comment?.body ?? "");
  if (!command) return { ok: true, ignored: "no slash command" };

  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const issue = payload.issue;
  if (!owner || !repo || !issue?.number || !issue.id) {
    return { ok: true, ignored: "incomplete issue payload" };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "DATABASE_URL is not set", status: 503 };
  }

  const db = getDb();
  const binding = await findRepoBinding(db, owner, repo);
  if (!binding) {
    return { ok: true, ignored: "no repo binding for this installation" };
  }

  const installationId = payload.installation?.id;
  if (installationId) {
    await upsertGithubInstallation(db, {
      organizationId: binding.organizationId,
      installationId: String(installationId),
    });
  }

  const kind: TicketKind =
    command.name === "spec" ? "spec" : command.name === "stop" ? "unknown" : "bug";
  const labels = (issue.labels ?? [])
    .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
    .filter(Boolean);

  const ticketInput = {
    provider: "github" as const,
    externalId: String(issue.id),
    identifier: `#${issue.number}`,
    url: issue.html_url ?? "",
    title: issue.title ?? `#${issue.number}`,
    body: issue.body ?? "",
    kind,
    labels,
  };

  tracker.remember({
    ref: {
      provider: "github",
      externalId: ticketInput.externalId,
      identifier: ticketInput.identifier,
    },
    url: ticketInput.url,
    title: ticketInput.title,
    body: ticketInput.body,
    kind: ticketInput.kind,
    labels: ticketInput.labels,
  });

  if (command.name === "stop") {
    const saved = await upsertTicket(db, {
      organizationId: binding.organizationId,
      repoBindingId: binding.id,
      ...ticketInput,
    });
    const cancelled = await cancelActiveRunsForTicket(db, saved.id);
    return { ok: true, cancelled: cancelled.length };
  }

  if (!command.pipeline) {
    return { ok: true, ignored: "no pipeline" };
  }

  const ownerMember = await getOrgOwner(db, binding.organizationId);
  return enqueueAgentRun(db, {
    organizationId: binding.organizationId,
    binding: {
      id: binding.id,
      githubOwner: owner,
      githubRepo: repo,
      defaultHarness: binding.defaultHarness,
    },
    ticket: ticketInput,
    pipeline: command.pipeline,
    harness: command.harness,
    trigger: "slash",
    specAuthorId: ownerMember?.userId ?? null,
    createSpec: command.name === "spec",
    publicAppUrl: process.env.BETTER_AUTH_URL,
    source: "github",
  });
}
