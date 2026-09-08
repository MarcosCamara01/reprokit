"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  evaluateSpecApprover,
  HARNESS_IDS,
  type HarnessId,
} from "@atrium/domain";
import {
  countApprovers,
  createApprovalRecord,
  createSpecVersion,
  getDb,
  getLatestSpecForTicket,
  getMembershipForUser,
  getRepoBindingById,
  getSpecWithTicket,
  updateSpecBody,
  updateSpecStatus,
} from "@atrium/db";
import { enqueueAgentRun } from "@atrium/api";
import { requireWorkspace } from "@/lib/workspace";

function isHarness(value: string): value is HarnessId {
  return (HARNESS_IDS as readonly string[]).includes(value);
}

function fail(message: string): never {
  throw new Error(message);
}

async function loadSpecForWorkspace(specId: string) {
  const { session, workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) fail("Database is not configured.");
  const db = getDb();
  const row = await getSpecWithTicket(db, specId);
  if (!row?.ticket || row.ticket.organizationId !== workspace.organization.id) {
    fail("Spec not found.");
  }
  const membership = await getMembershipForUser(
    db,
    workspace.organization.id,
    session.user.id,
  );
  return { db, session, workspace, row, membership };
}

export async function submitSpecForReviewAction(formData: FormData): Promise<void> {
  const specId = String(formData.get("specId") ?? "");
  const loaded = await loadSpecForWorkspace(specId);
  const { db, session, row } = loaded;
  if (row.authorId !== session.user.id && loaded.membership?.role === "member") {
    fail("Only the author or an approver can submit this spec.");
  }
  const body = String(formData.get("bodyMarkdown") ?? row.bodyMarkdown);
  await updateSpecBody(db, specId, body);
  await updateSpecStatus(db, specId, "in_review");
  await createApprovalRecord(db, {
    organizationId: row.ticket.organizationId,
    subject: "spec",
    subjectId: specId,
    requestedBy: session.user.id,
    status: "pending",
  });
  revalidatePath(`/specs/${specId}`);
}

export async function approveSpecAction(formData: FormData): Promise<void> {
  const specId = String(formData.get("specId") ?? "");
  const loaded = await loadSpecForWorkspace(specId);
  const { db, session, workspace, row, membership } = loaded;
  if (!membership) fail("Not a member of this workspace.");

  const approverCount = await countApprovers(db, workspace.organization.id);
  const decision = evaluateSpecApprover({
    authorId: row.authorId,
    approverId: session.user.id,
    approverRole: membership.role,
    approverCount,
  });
  if (!decision.ok) fail(decision.reason);

  await createApprovalRecord(db, {
    organizationId: workspace.organization.id,
    subject: "spec",
    subjectId: specId,
    requestedBy: row.authorId,
    approverId: session.user.id,
    status: "approved",
    comment:
      String(formData.get("comment") ?? "").trim() ||
      (decision.selfApprove ? "Self-approved (solo founder)" : null),
  });
  await updateSpecStatus(db, specId, "approved");
  revalidatePath(`/specs/${specId}`);
  revalidatePath("/specs");
}

export async function requestSpecChangesAction(formData: FormData): Promise<void> {
  const specId = String(formData.get("specId") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment) fail("Describe the changes you need.");
  const loaded = await loadSpecForWorkspace(specId);
  const { db, session, workspace, membership } = loaded;
  if (membership?.role !== "owner" && membership?.role !== "approver") {
    fail("Only owners and approvers can request changes.");
  }
  await createApprovalRecord(db, {
    organizationId: workspace.organization.id,
    subject: "spec",
    subjectId: specId,
    requestedBy: loaded.row.authorId,
    approverId: session.user.id,
    status: "rejected",
    comment,
  });
  await updateSpecStatus(db, specId, "rejected");
  revalidatePath(`/specs/${specId}`);
}

export async function newSpecVersionAction(formData: FormData): Promise<void> {
  const specId = String(formData.get("specId") ?? "");
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  if (!bodyMarkdown) fail("Spec body is required.");
  const loaded = await loadSpecForWorkspace(specId);
  const created = await createSpecVersion(loaded.db, {
    ticketId: loaded.row.ticketId,
    bodyMarkdown,
    authorId: loaded.session.user.id,
    status: "draft",
  });
  revalidatePath("/specs");
  redirect(`/specs/${created.id}`);
}

export async function implementSpecAction(formData: FormData): Promise<void> {
  const specId = String(formData.get("specId") ?? "");
  const harnessRaw = String(formData.get("harness") ?? "claude");
  const harness = isHarness(harnessRaw) ? harnessRaw : "claude";
  const loaded = await loadSpecForWorkspace(specId);
  const { db, workspace, row } = loaded;
  if (row.status !== "approved") {
    fail("Specs must be approved before implement.");
  }
  const latest = await getLatestSpecForTicket(db, row.ticketId);
  if (!latest || latest.id !== row.id || latest.status !== "approved") {
    fail("Only the latest approved spec can be implemented.");
  }
  const ticket = row.ticket;
  const binding = ticket.repoBindingId
    ? await getRepoBindingById(db, ticket.repoBindingId)
    : null;

  const result = await enqueueAgentRun(db, {
    organizationId: workspace.organization.id,
    binding: binding
      ? {
          id: binding.id,
          githubOwner: binding.githubOwner,
          githubRepo: binding.githubRepo,
          defaultHarness: binding.defaultHarness,
        }
      : null,
    ticket: {
      provider: ticket.provider,
      externalId: ticket.externalId,
      identifier: ticket.identifier,
      url: ticket.url,
      title: ticket.title,
      body: ticket.body,
      kind: "spec",
      labels: ticket.labels,
    },
    pipeline: "spec_implement",
    harness,
    trigger: "web",
    createSpec: false,
    intakeBody: latest.bodyMarkdown,
    publicAppUrl: process.env.BETTER_AUTH_URL,
    source: ticket.provider === "linear" ? "linear" : "github",
  });

  if (result.ok && "runId" in result) {
    redirect(`/runs/${result.runId}`);
  }
  fail("Could not queue spec_implement.");
}
