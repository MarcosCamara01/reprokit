"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { HARNESS_IDS, type HarnessId } from "@atrium/domain";
import {
  createSpecVersion,
  getDb,
  getRepoBindingById,
  getTicketById,
} from "@atrium/db";
import { enqueueAgentRun } from "@atrium/api";
import { requireWorkspace } from "@/lib/workspace";

function isHarness(value: string): value is HarnessId {
  return (HARNESS_IDS as readonly string[]).includes(value);
}

function fail(message: string): never {
  throw new Error(message);
}

export async function openTicketAsSpecAction(formData: FormData): Promise<void> {
  const { session, workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) fail("Database is not configured.");
  const ticketId = String(formData.get("ticketId") ?? "");
  const db = getDb();
  const ticket = await getTicketById(db, ticketId);
  if (!ticket || ticket.organizationId !== workspace.organization.id) {
    fail("Ticket not found.");
  }
  const created = await createSpecVersion(db, {
    ticketId: ticket.id,
    bodyMarkdown: ticket.body.trim().startsWith("#")
      ? ticket.body
      : `# ${ticket.title}\n\n${ticket.body}`.trim(),
    authorId: session.user.id,
    status: "draft",
  });
  revalidatePath("/specs");
  redirect(`/specs/${created.id}`);
}

export async function startBugFixAction(formData: FormData): Promise<void> {
  const { workspace, dbUnavailable } = await requireWorkspace();
  if (dbUnavailable || !workspace) fail("Database is not configured.");
  const ticketId = String(formData.get("ticketId") ?? "");
  const harnessRaw = String(formData.get("harness") ?? "claude");
  const harness = isHarness(harnessRaw) ? harnessRaw : "claude";
  const db = getDb();
  const ticket = await getTicketById(db, ticketId);
  if (!ticket || ticket.organizationId !== workspace.organization.id) {
    fail("Ticket not found.");
  }
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
      kind: "bug",
      labels: ticket.labels,
    },
    pipeline: "bug_fix",
    harness,
    trigger: "web",
    publicAppUrl: process.env.BETTER_AUTH_URL,
    source: ticket.provider === "linear" ? "linear" : "github",
  });
  if (result.ok && "runId" in result) {
    redirect(`/runs/${result.runId}`);
  }
  fail("Could not queue the run.");
}
