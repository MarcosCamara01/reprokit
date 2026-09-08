import {
  decideInitialRunStatus,
  DEFAULT_POLICY,
  specCopyPath,
  type HarnessId,
  type Pipeline,
  type SpecStatus,
  type TicketKind,
  type Trigger,
} from "@atrium/domain";
import {
  appendRunEvents,
  cancelActiveRunsForTicket,
  createAgentRun,
  createApprovalRecord,
  createSpecVersion,
  getLatestSpecForTicket,
  getOrgPolicy,
  insertRunArtifact,
  upsertTicket,
  type Database,
} from "@atrium/db";

export type EnqueueBinding = {
  id: string;
  githubOwner: string;
  githubRepo: string;
  defaultHarness: HarnessId;
} | null;

export type EnqueueTicketInput = {
  provider: "github" | "linear";
  externalId: string;
  identifier: string;
  url: string;
  title: string;
  body: string;
  kind: TicketKind;
  labels: string[];
};

export type EnqueueResult =
  | { ok: true; ignored: string }
  | { ok: true; cancelled: number }
  | { ok: true; runId: string; status: string; specId?: string };

export async function enqueueAgentRun(
  db: Database,
  input: {
    organizationId: string;
    binding: EnqueueBinding;
    ticket: EnqueueTicketInput;
    pipeline: Pipeline;
    harness: HarnessId;
    trigger: Trigger;
    specAuthorId?: string | null;
    createSpec?: boolean;
    agentSessionId?: string | null;
    publicAppUrl?: string | null;
    extraBody?: string;
    intakeBody?: string;
    source: "github" | "linear";
  },
): Promise<EnqueueResult> {
  const storedBody = input.extraBody
    ? `${input.ticket.body}\n\n## Follow-up\n\n${input.extraBody}`.trim()
    : input.ticket.body;
  const intakeBody = input.intakeBody ?? storedBody;

  const saved = await upsertTicket(db, {
    organizationId: input.organizationId,
    repoBindingId: input.binding?.id ?? null,
    provider: input.ticket.provider,
    externalId: input.ticket.externalId,
    identifier: input.ticket.identifier,
    url: input.ticket.url,
    title: input.ticket.title,
    body: storedBody,
    kind: input.ticket.kind,
    labels: input.ticket.labels,
  });

  const policySnapshot =
    (await getOrgPolicy(db, input.organizationId, input.binding?.id ?? null)) ??
    DEFAULT_POLICY;

  let specStatus: SpecStatus | null =
    input.pipeline === "spec_implement" ? "draft" : null;
  let specId: string | undefined;

  if (input.pipeline === "spec_implement" && input.createSpec && input.specAuthorId) {
    const created = await createSpecVersion(db, {
      ticketId: saved.id,
      bodyMarkdown: markdownFromTicket(saved.title, storedBody),
      authorId: input.specAuthorId,
      status: "in_review",
    });
    specStatus = created.status;
    specId = created.id;
    await createApprovalRecord(db, {
      organizationId: input.organizationId,
      subject: "spec",
      subjectId: created.id,
      requestedBy: input.specAuthorId,
      status: "pending",
    });
  } else if (input.pipeline === "spec_implement") {
    const latest = await getLatestSpecForTicket(db, saved.id);
    specStatus = latest?.status ?? "draft";
    specId = latest?.id;
  }

  const initial = decideInitialRunStatus({
    intake: { title: saved.title, body: intakeBody },
    binding: {
      githubOwner: input.binding?.githubOwner,
      githubRepo: input.binding?.githubRepo,
      source: input.source,
    },
    approval: {
      pipeline: input.pipeline,
      trigger: input.trigger,
      specStatus,
      policy: policySnapshot,
    },
  });

  const run = await createAgentRun(db, {
    organizationId: input.organizationId,
    ticketId: saved.id,
    pipeline: input.pipeline,
    harness: input.harness,
    status: initial.status,
    trigger: input.trigger,
    policySnapshot,
    errorSummary:
      initial.blockedBy && !initial.blockedBy.ok ? initial.blockedBy.reason : null,
  });

  const events: Array<{ stream: string; level: string; message: string }> = [];
  if (input.agentSessionId) {
    events.push({
      stream: "linear",
      level: "info",
      message: `agent_session:${input.agentSessionId}`,
    });
  }
  const runUrl = input.publicAppUrl
    ? `${input.publicAppUrl.replace(/\/$/, "")}/runs/${run.id}`
    : null;
  if (runUrl) {
    events.push({ stream: "linear", level: "info", message: `run_url:${runUrl}` });
  }
  if (events.length) {
    await appendRunEvents(db, run.id, events);
  }

  if (input.pipeline === "spec_implement" && specId && specStatus === "approved") {
    const latest = await getLatestSpecForTicket(db, saved.id);
    if (latest) {
      await insertRunArtifact(db, {
        runId: run.id,
        kind: "spec",
        excerpt: latest.bodyMarkdown,
        metadata: {
          intent: "write_on_branch",
          branchPath: specCopyPath(saved.identifier),
          specId: latest.id,
          specVersion: latest.version,
          ticketIdentifier: saved.identifier,
        },
      });
    }
  }

  return { ok: true, runId: run.id, status: run.status, specId };
}

export async function cancelTicketRuns(db: Database, ticketId: string) {
  const cancelled = await cancelActiveRunsForTicket(db, ticketId);
  return { ok: true as const, cancelled: cancelled.length };
}

function markdownFromTicket(title: string, body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith("#")) return trimmed;
  return `# ${title}\n\n${trimmed}`.trim();
}
