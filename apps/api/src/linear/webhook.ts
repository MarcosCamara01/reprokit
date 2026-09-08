import { DEFAULT_HARNESS, type HarnessId, type Pipeline, type TicketKind } from "@atrium/domain";
import {
  findLatestRunForTicket,
  findLinearConnectionByLinearOrg,
  findRepoBindingForLinear,
  getDb,
  getOrgOwner,
  isDatabaseConfigured,
  setAgentRunStatus,
  upsertTicket,
} from "@atrium/db";
import { LinearTracker } from "@atrium/trackers";
import { parseSlashCommand } from "../github/parse-command";
import { cancelTicketRuns, enqueueAgentRun } from "../intake/enqueue-run";
import {
  extractAgentSessionId,
  extractCommentBody,
  extractCommentIssueId,
  extractIssueFromWebhook,
  isAgentSessionEvent,
  isAgentStopSignal,
  isHumanLinearActor,
  linearIssueBindingKeys,
  mapLinearIssueToTicket,
  webhookEventName,
  type LinearIssueFields,
  type LinearWebhookPayload,
} from "./mapping";
import { verifyLinearSignature, verifyLinearTimestamp } from "./signature";
import { getValidLinearAccessToken } from "./token";

export type LinearWebhookResult =
  | { ok: true; ignored: string }
  | { ok: true; runId: string; status: string }
  | { ok: true; cancelled: number }
  | { ok: false; error: string; status: number };

export async function handleLinearWebhook(input: {
  rawBody: string;
  signature: string | null;
  event: string | null;
  secret: string;
  nowMs?: number;
  publicAppUrl?: string;
}): Promise<LinearWebhookResult> {
  if (!verifyLinearSignature(input.rawBody, input.signature, input.secret)) {
    return { ok: false, error: "invalid signature", status: 401 };
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(input.rawBody) as LinearWebhookPayload;
  } catch {
    return { ok: false, error: "invalid json", status: 400 };
  }

  if (!verifyLinearTimestamp(payload.webhookTimestamp, input.nowMs)) {
    return { ok: false, error: "stale webhook", status: 401 };
  }

  const event = webhookEventName(input.event, payload);

  if (isAgentSessionEvent(input.event, payload)) {
    return handleAgentSession(payload, input.publicAppUrl);
  }

  if (event === "comment" && (payload.action === "create" || payload.action === "created")) {
    return handleComment(payload, input.publicAppUrl);
  }

  if (event === "issue" && payload.action !== "remove") {
    return syncIssue(payload);
  }

  return { ok: true, ignored: `${event}:${payload.action ?? ""}` };
}

async function syncIssue(payload: LinearWebhookPayload): Promise<LinearWebhookResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "DATABASE_URL is not set", status: 503 };
  }
  const ctx = await resolveLinearOrg(payload.organizationId);
  if (!ctx) return { ok: true, ignored: "no linear connection for this workspace" };

  const issue = extractIssueFromWebhook(payload);
  const mapped = issue ? mapLinearIssueToTicket({ issue, fallbackUrl: payload.url }) : null;
  if (!mapped || !issue) return { ok: true, ignored: "incomplete issue payload" };

  const keys = linearIssueBindingKeys(issue);
  const binding = await findRepoBindingForLinear(ctx.db, {
    organizationId: ctx.organizationId,
    linearTeamId: keys.teamId,
    linearProjectId: keys.projectId,
  });

  await upsertTicket(ctx.db, {
    organizationId: ctx.organizationId,
    repoBindingId: binding?.id ?? null,
    provider: "linear",
    ...mapped,
    kind: inferKind(mapped.labels, null),
  });
  return { ok: true, ignored: "issue synced" };
}

async function handleComment(
  payload: LinearWebhookPayload,
  publicAppUrl?: string,
): Promise<LinearWebhookResult> {
  if (!isHumanLinearActor(payload.actor)) {
    return { ok: true, ignored: "non-human comment" };
  }
  const command = parseSlashCommand(extractCommentBody(payload));
  if (!command) return { ok: true, ignored: "no slash command" };
  return startFromLinear({
    payload,
    commandName: command.name,
    harness: command.harness,
    pipeline: command.pipeline,
    trigger: "slash",
    publicAppUrl,
  });
}

async function handleAgentSession(
  payload: LinearWebhookPayload,
  publicAppUrl?: string,
): Promise<LinearWebhookResult> {
  if (payload.action === "prompted" && isAgentStopSignal(payload)) {
    return stopFromLinear(payload);
  }

  const command = parseSlashCommand(extractCommentBody(payload));
  if (command?.name === "stop") {
    return stopFromLinear(payload);
  }

  if (payload.action === "prompted" && !command) {
    const resumed = await resumeNeedsInfo(payload, publicAppUrl);
    if (resumed) return resumed;
  }

  const pipeline = command?.pipeline ?? "bug_fix";
  if (!pipeline) {
    return { ok: true, ignored: "no pipeline" };
  }

  return startFromLinear({
    payload,
    commandName: command?.name ?? "delegate",
    harness: command?.harness ?? DEFAULT_HARNESS,
    pipeline,
    trigger: "linear_delegate",
      extraBody: (payload.promptContext ?? extractCommentBody(payload)) || undefined,
    publicAppUrl,
  });
}

async function stopFromLinear(payload: LinearWebhookPayload): Promise<LinearWebhookResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "DATABASE_URL is not set", status: 503 };
  }
  const ctx = await resolveLinearOrg(payload.organizationId);
  if (!ctx) return { ok: true, ignored: "no linear connection for this workspace" };
  const issue = await loadIssue(ctx, payload);
  const mapped = issue ? mapLinearIssueToTicket({ issue }) : null;
  if (!mapped) return { ok: true, ignored: "incomplete issue" };
  const saved = await upsertTicket(ctx.db, {
    organizationId: ctx.organizationId,
    provider: "linear",
    ...mapped,
    kind: inferKind(mapped.labels, "stop"),
  });
  return cancelTicketRuns(ctx.db, saved.id);
}

async function resumeNeedsInfo(
  payload: LinearWebhookPayload,
  publicAppUrl?: string,
): Promise<LinearWebhookResult | null> {
  if (!isDatabaseConfigured()) return null;
  const ctx = await resolveLinearOrg(payload.organizationId);
  if (!ctx) return { ok: true, ignored: "no linear connection for this workspace" };
  const issue = await loadIssue(ctx, payload);
  const mapped = issue ? mapLinearIssueToTicket({ issue, fallbackUrl: payload.url }) : null;
  if (!mapped || !issue) return { ok: true, ignored: "incomplete issue" };

  const followUp = extractCommentBody(payload).trim();
  if (!followUp) return null;

  const keys = linearIssueBindingKeys(issue);
  const binding = await findRepoBindingForLinear(ctx.db, {
    organizationId: ctx.organizationId,
    linearTeamId: keys.teamId,
    linearProjectId: keys.projectId,
  });

  const saved = await upsertTicket(ctx.db, {
    organizationId: ctx.organizationId,
    repoBindingId: binding?.id ?? null,
    provider: "linear",
    ...mapped,
    kind: inferKind(mapped.labels, null),
  });

  const latest = await findLatestRunForTicket(ctx.db, saved.id);
  if (!latest || latest.status !== "needs_info") return null;

  const result = await enqueueAgentRun(ctx.db, {
    organizationId: ctx.organizationId,
    binding: binding
      ? {
          id: binding.id,
          githubOwner: binding.githubOwner,
          githubRepo: binding.githubRepo,
          defaultHarness: binding.defaultHarness,
        }
      : null,
    ticket: {
      provider: "linear",
      ...mapped,
      kind: saved.kind,
    },
    pipeline: latest.pipeline,
    harness: latest.harness,
    trigger: "linear_delegate",
    agentSessionId: extractAgentSessionId(payload),
    publicAppUrl,
    extraBody: followUp,
    source: "linear",
  });

  if (result.ok && "runId" in result) {
    await setAgentRunStatus(ctx.db, latest.id, {
      status: "cancelled",
      errorSummary: "Superseded by Linear follow-up",
    });
    await ackLinearSession(ctx.organizationId, payload, result);
  }
  return result;
}

async function startFromLinear(input: {
  payload: LinearWebhookPayload;
  commandName: string;
  harness: HarnessId;
  pipeline: Pipeline | null;
  trigger: "slash" | "linear_delegate";
  extraBody?: string;
  publicAppUrl?: string;
}): Promise<LinearWebhookResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "DATABASE_URL is not set", status: 503 };
  }
  const ctx = await resolveLinearOrg(input.payload.organizationId);
  if (!ctx) return { ok: true, ignored: "no linear connection for this workspace" };

  if (input.commandName === "stop") {
    return stopFromLinear(input.payload);
  }
  if (!input.pipeline) {
    return { ok: true, ignored: "no pipeline" };
  }

  const issue = await loadIssue(ctx, input.payload);
  const mapped = issue
    ? mapLinearIssueToTicket({ issue, fallbackUrl: input.payload.url })
    : null;
  if (!mapped || !issue) return { ok: true, ignored: "incomplete issue payload" };

  const keys = linearIssueBindingKeys(issue);
  const binding = await findRepoBindingForLinear(ctx.db, {
    organizationId: ctx.organizationId,
    linearTeamId: keys.teamId,
    linearProjectId: keys.projectId,
  });

  const kind = inferKind(mapped.labels, input.commandName);
  const owner = await getOrgOwner(ctx.db, ctx.organizationId);

  const result = await enqueueAgentRun(ctx.db, {
    organizationId: ctx.organizationId,
    binding: binding
      ? {
          id: binding.id,
          githubOwner: binding.githubOwner,
          githubRepo: binding.githubRepo,
          defaultHarness: binding.defaultHarness,
        }
      : null,
    ticket: {
      provider: "linear",
      ...mapped,
      kind,
    },
    pipeline: input.pipeline,
    harness: input.harness,
    trigger: input.trigger,
    specAuthorId: owner?.userId ?? null,
    createSpec: input.commandName === "spec",
    agentSessionId: extractAgentSessionId(input.payload),
    publicAppUrl: input.publicAppUrl,
    extraBody: input.extraBody,
    source: "linear",
  });

  if (result.ok && "runId" in result) {
    await ackLinearSession(ctx.organizationId, input.payload, result);
  }
  return result;
}

async function ackLinearSession(
  organizationId: string,
  payload: LinearWebhookPayload,
  result: { runId: string; status: string },
): Promise<void> {
  const sessionId = extractAgentSessionId(payload);
  const issue = extractIssueFromWebhook(payload);
  const issueId = issue?.id ?? extractCommentIssueId(payload);
  const token = await getValidLinearAccessToken(getDb(), organizationId);
  if (!token || !issueId) return;

  const publicUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
  const runUrl = publicUrl ? `${publicUrl}/runs/${result.runId}` : undefined;
  const tracker = new LinearTracker({
    accessToken: token.token,
    agentSessionId: sessionId,
    runUrl,
  });
  const ref = {
    provider: "linear" as const,
    externalId: issueId,
    identifier: issue?.identifier ?? issueId,
  };

  try {
    if (sessionId && runUrl) {
      await tracker.updateAgentSession({
        externalUrls: [{ label: "Atrium run", url: runUrl }],
      });
      await tracker.postAgentActivity({
        type: "thought",
        body: `Queued in Atrium (${result.status}).`,
      });
    }
    if (result.status === "needs_info") {
      await tracker.requestInfo(ref, [
        "Which GitHub repository should this Linear issue run in?",
        "Add a RepoBinding (Linear team/project → GitHub owner/repo) in Atrium Settings, then reply here.",
      ]);
    }
  } catch {
    // Control-plane ack is best-effort; the AgentRun is already persisted.
  }
}

async function loadIssue(
  ctx: { db: ReturnType<typeof getDb>; organizationId: string },
  payload: LinearWebhookPayload,
): Promise<LinearIssueFields | null> {
  const embedded = extractIssueFromWebhook(payload);
  if (embedded?.id && (embedded.identifier || embedded.title)) return embedded;

  const issueId = extractCommentIssueId(payload) ?? embedded?.id;
  if (!issueId) return embedded;

  const token = await getValidLinearAccessToken(ctx.db, ctx.organizationId);
  if (!token) return embedded;
  try {
    const tracker = new LinearTracker({ accessToken: token.token });
    const snapshot = await tracker.getIssue({
      provider: "linear",
      externalId: issueId,
      identifier: embedded?.identifier ?? issueId,
    });
    return {
      id: snapshot.ref.externalId,
      identifier: snapshot.ref.identifier,
      title: snapshot.title,
      description: snapshot.body,
      url: snapshot.url,
      teamId: embedded?.teamId ?? embedded?.team?.id,
      projectId: embedded?.projectId ?? embedded?.project?.id,
      labels: snapshot.labels.map((name) => ({ name })),
    };
  } catch {
    return embedded;
  }
}

async function resolveLinearOrg(linearOrganizationId: string | undefined) {
  if (!linearOrganizationId || !isDatabaseConfigured()) return null;
  const db = getDb();
  const connection = await findLinearConnectionByLinearOrg(db, linearOrganizationId);
  if (!connection) return null;
  return { db, organizationId: connection.organizationId };
}

function inferKind(labels: string[], commandName: string | null): TicketKind {
  if (commandName === "spec") return "spec";
  if (labels.some((label) => /spec|feature/i.test(label))) return "spec";
  if (
    commandName === "fix" ||
    commandName === "repro" ||
    commandName === "compare" ||
    commandName === "delegate"
  ) {
    return "bug";
  }
  return "unknown";
}
