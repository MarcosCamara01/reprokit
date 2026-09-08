export type LinearActor = {
  id?: string;
  type?: string;
  name?: string;
};

export type LinearIssueFields = {
  id?: string;
  identifier?: string;
  title?: string;
  description?: string | null;
  url?: string;
  teamId?: string | null;
  projectId?: string | null;
  team?: { id?: string; name?: string; key?: string } | null;
  project?: { id?: string; name?: string } | null;
  labels?: Array<{ name?: string }> | { nodes?: Array<{ name?: string }> };
};

export type LinearCommentFields = {
  id?: string;
  body?: string | null;
  issueId?: string;
  userId?: string;
};

export type LinearAgentSession = {
  id?: string;
  issue?: LinearIssueFields | null;
  comment?: { id?: string; body?: string | null } | null;
};

export type LinearWebhookPayload = {
  action?: string;
  type?: string;
  organizationId?: string;
  webhookTimestamp?: number;
  url?: string;
  actor?: LinearActor | null;
  data?: LinearIssueFields & LinearCommentFields;
  agentSession?: LinearAgentSession;
  promptContext?: string;
  agentActivity?: { body?: string | null; signal?: string | null };
};

export type LinearBindingKeys = {
  teamId: string | null;
  projectId: string | null;
};

export function isHumanLinearActor(actor: LinearActor | null | undefined): boolean {
  if (!actor?.type) return true;
  return actor.type === "user";
}

export function linearIssueLabels(issue: LinearIssueFields): string[] {
  const raw = Array.isArray(issue.labels) ? issue.labels : (issue.labels?.nodes ?? []);
  return raw.map((label) => label.name ?? "").filter(Boolean);
}

export function linearIssueBindingKeys(issue: LinearIssueFields): LinearBindingKeys {
  return {
    teamId: issue.teamId ?? issue.team?.id ?? null,
    projectId: issue.projectId ?? issue.project?.id ?? null,
  };
}

export function mapLinearIssueToTicket(input: {
  issue: LinearIssueFields;
  fallbackUrl?: string;
}): {
  externalId: string;
  identifier: string;
  url: string;
  title: string;
  body: string;
  labels: string[];
} | null {
  const id = input.issue.id;
  if (!id) return null;
  const identifier = input.issue.identifier ?? id;
  return {
    externalId: id,
    identifier,
    url: input.issue.url ?? input.fallbackUrl ?? "",
    title: input.issue.title ?? identifier,
    body: input.issue.description ?? "",
    labels: linearIssueLabels(input.issue),
  };
}

export function extractIssueFromWebhook(
  payload: LinearWebhookPayload,
): LinearIssueFields | null {
  if (payload.agentSession?.issue) return payload.agentSession.issue;
  if (payload.type === "Issue" && payload.data?.id) return payload.data;
  return null;
}

export function extractCommentBody(payload: LinearWebhookPayload): string {
  return payload.data?.body ?? payload.agentActivity?.body ?? "";
}

export function extractCommentIssueId(payload: LinearWebhookPayload): string | null {
  return payload.data?.issueId ?? payload.agentSession?.issue?.id ?? null;
}

export function extractAgentSessionId(payload: LinearWebhookPayload): string | null {
  return payload.agentSession?.id ?? null;
}

export function isAgentStopSignal(payload: LinearWebhookPayload): boolean {
  const signal = payload.agentActivity?.signal?.toLowerCase();
  if (signal === "stop") return true;
  return false;
}

export function isAgentSessionEvent(
  eventHeader: string | null,
  payload: LinearWebhookPayload,
): boolean {
  const event = (eventHeader ?? payload.type ?? "").toLowerCase();
  return event === "agentsessionevent";
}

export function webhookEventName(
  eventHeader: string | null,
  payload: LinearWebhookPayload,
): string {
  return (eventHeader || payload.type || "unknown").toLowerCase();
}
