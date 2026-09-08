import { and, desc, eq } from "drizzle-orm";
import type { SpecStatus } from "@atrium/domain";
import type { Database } from "../client";
import { agentRun, approval, spec, ticket } from "../schema/index";
import { newId } from "./workspace";

export async function listTicketsForOrg(db: Database, organizationId: string) {
  return db.query.ticket.findMany({
    where: eq(ticket.organizationId, organizationId),
    orderBy: [desc(ticket.updatedAt)],
    with: { specs: true, repoBinding: true },
  });
}

export async function getTicketById(db: Database, ticketId: string) {
  return db.query.ticket.findFirst({
    where: eq(ticket.id, ticketId),
    with: { specs: true, repoBinding: true },
  });
}

export async function getLatestSpecForTicket(db: Database, ticketId: string) {
  return db.query.spec.findFirst({
    where: eq(spec.ticketId, ticketId),
    orderBy: [desc(spec.version)],
  });
}

export async function listSpecsForOrg(db: Database, organizationId: string) {
  const tickets = await db.query.ticket.findMany({
    where: eq(ticket.organizationId, organizationId),
    with: {
      specs: {
        orderBy: (row, { desc: d }) => [d(row.version)],
      },
    },
    orderBy: [desc(ticket.updatedAt)],
  });
  return tickets
    .map((row) => {
      const latest = row.specs[0];
      if (!latest) return null;
      return { spec: latest, ticket: row };
    })
    .filter((row): row is { spec: (typeof tickets)[number]["specs"][number]; ticket: (typeof tickets)[number] } =>
      Boolean(row),
    );
}

export async function getSpecWithTicket(db: Database, specId: string) {
  return db.query.spec.findFirst({
    where: eq(spec.id, specId),
    with: { ticket: true, author: true },
  });
}

export async function listSpecVersions(db: Database, ticketId: string) {
  return db.query.spec.findMany({
    where: eq(spec.ticketId, ticketId),
    orderBy: [desc(spec.version)],
  });
}

export async function createSpecVersion(
  db: Database,
  input: {
    ticketId: string;
    bodyMarkdown: string;
    authorId: string;
    status?: Extract<SpecStatus, "draft" | "in_review">;
  },
) {
  const latest = await getLatestSpecForTicket(db, input.ticketId);
  if (latest && latest.status !== "superseded") {
    await db
      .update(spec)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(eq(spec.id, latest.id));
  }
  const [created] = await db
    .insert(spec)
    .values({
      id: newId(),
      ticketId: input.ticketId,
      version: (latest?.version ?? 0) + 1,
      bodyMarkdown: input.bodyMarkdown,
      status: input.status ?? "draft",
      authorId: input.authorId,
    })
    .returning();
  return created!;
}

export async function updateSpecStatus(
  db: Database,
  specId: string,
  status: SpecStatus,
) {
  const [updated] = await db
    .update(spec)
    .set({ status, updatedAt: new Date() })
    .where(eq(spec.id, specId))
    .returning();
  return updated ?? null;
}

export async function updateSpecBody(
  db: Database,
  specId: string,
  bodyMarkdown: string,
) {
  const [updated] = await db
    .update(spec)
    .set({ bodyMarkdown, updatedAt: new Date() })
    .where(eq(spec.id, specId))
    .returning();
  return updated ?? null;
}

export async function listApprovalsForSubject(
  db: Database,
  subject: "spec" | "bug_fix" | "rerun",
  subjectId: string,
) {
  return db.query.approval.findMany({
    where: and(eq(approval.subject, subject), eq(approval.subjectId, subjectId)),
    orderBy: [desc(approval.createdAt)],
  });
}

export async function createApprovalRecord(
  db: Database,
  input: {
    organizationId: string;
    subject: "spec" | "bug_fix" | "rerun";
    subjectId: string;
    requestedBy: string;
    approverId?: string | null;
    status?: "pending" | "approved" | "rejected";
    comment?: string | null;
  },
) {
  const [created] = await db
    .insert(approval)
    .values({
      id: newId(),
      organizationId: input.organizationId,
      subject: input.subject,
      subjectId: input.subjectId,
      requestedBy: input.requestedBy,
      approverId: input.approverId ?? null,
      status: input.status ?? "pending",
      comment: input.comment ?? null,
    })
    .returning();
  return created!;
}

export async function findLatestRunForTicket(db: Database, ticketId: string) {
  return db.query.agentRun.findFirst({
    where: eq(agentRun.ticketId, ticketId),
    orderBy: [desc(agentRun.createdAt)],
  });
}

export async function setAgentRunStatus(
  db: Database,
  runId: string,
  input: {
    status: "needs_info" | "awaiting_approval" | "queued" | "cancelled";
    errorSummary?: string | null;
  },
) {
  const [updated] = await db
    .update(agentRun)
    .set({
      status: input.status,
      errorSummary: input.errorSummary ?? null,
      updatedAt: new Date(),
    })
    .where(eq(agentRun.id, runId))
    .returning();
  return updated ?? null;
}
