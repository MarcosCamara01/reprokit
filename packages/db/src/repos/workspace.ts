import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { DEFAULT_POLICY, type PolicySnapshot } from "@atrium/domain";
import type { Database } from "../client";
import {
  agentRun,
  machine,
  membership,
  organization,
  policy,
  repoBinding,
  ticket,
} from "../schema/index";

export function newId(): string {
  return crypto.randomUUID();
}

export async function ensureUserWorkspace(
  db: Database,
  input: { userId: string; name: string; email: string },
) {
  const existing = await db.query.membership.findFirst({
    where: eq(membership.userId, input.userId),
  });
  if (existing) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, existing.organizationId),
    });
    return { organization: org!, membership: existing };
  }

  const orgId = newId();
  const slugBase =
    input.email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "org";
  const slug = `${slugBase}-${orgId.slice(0, 8)}`;

  await db.insert(organization).values({
    id: orgId,
    name: `${input.name || "Atrium"} workspace`,
    slug,
  });
  const [member] = await db
    .insert(membership)
    .values({
      id: newId(),
      organizationId: orgId,
      userId: input.userId,
      role: "owner",
    })
    .returning();
  await db.insert(policy).values({
    id: newId(),
    organizationId: orgId,
    ...DEFAULT_POLICY,
  });

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });
  return { organization: org!, membership: member! };
}

export async function findRepoBinding(
  db: Database,
  githubOwner: string,
  githubRepo: string,
) {
  return db.query.repoBinding.findFirst({
    where: and(
      eq(repoBinding.githubOwner, githubOwner),
      eq(repoBinding.githubRepo, githubRepo),
    ),
  });
}

export async function getOrgPolicy(
  db: Database,
  organizationId: string,
  repoBindingId?: string | null,
): Promise<PolicySnapshot> {
  if (repoBindingId) {
    const repoPolicy = await db.query.policy.findFirst({
      where: eq(policy.repoBindingId, repoBindingId),
    });
    if (repoPolicy) {
      return {
        defaultHarness: repoPolicy.defaultHarness,
        concurrentRuns: repoPolicy.concurrentRuns,
        autoIntake: repoPolicy.autoIntake,
        specRequiresApproval: repoPolicy.specRequiresApproval,
        pauseAfterRepro: repoPolicy.pauseAfterRepro,
      };
    }
  }
  const orgPolicy = await db.query.policy.findFirst({
    where: and(eq(policy.organizationId, organizationId), isNull(policy.repoBindingId)),
  });
  if (!orgPolicy) return DEFAULT_POLICY;
  return {
    defaultHarness: orgPolicy.defaultHarness,
    concurrentRuns: orgPolicy.concurrentRuns,
    autoIntake: orgPolicy.autoIntake,
    specRequiresApproval: orgPolicy.specRequiresApproval,
    pauseAfterRepro: orgPolicy.pauseAfterRepro,
  };
}

export async function upsertTicket(
  db: Database,
  input: {
    organizationId: string;
    repoBindingId?: string | null;
    provider: "github" | "linear";
    externalId: string;
    identifier: string;
    url: string;
    title: string;
    body: string;
    kind: "bug" | "spec" | "unknown";
    labels: string[];
  },
) {
  const existing = await db.query.ticket.findFirst({
    where: and(
      eq(ticket.organizationId, input.organizationId),
      eq(ticket.provider, input.provider),
      eq(ticket.externalId, input.externalId),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(ticket)
      .set({
        title: input.title,
        body: input.body,
        url: input.url,
        kind: input.kind,
        labels: input.labels,
        repoBindingId: input.repoBindingId ?? existing.repoBindingId,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ticket.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(ticket)
    .values({
      id: newId(),
      lastSyncedAt: new Date(),
      ...input,
    })
    .returning();
  return created!;
}

export async function createAgentRun(
  db: Database,
  input: {
    organizationId: string;
    ticketId: string | null;
    machineId?: string | null;
    pipeline: "bug_repro" | "bug_fix" | "spec_implement" | "compare";
    harness: "claude" | "codex" | "cursor";
    status: "needs_info" | "awaiting_approval" | "queued";
    trigger: "slash" | "web" | "linear_delegate" | "label" | "api";
    policySnapshot: PolicySnapshot;
    errorSummary?: string | null;
  },
) {
  const [run] = await db
    .insert(agentRun)
    .values({
      id: newId(),
      organizationId: input.organizationId,
      ticketId: input.ticketId,
      machineId: input.machineId ?? null,
      pipeline: input.pipeline,
      harness: input.harness,
      status: input.status,
      phase: null,
      trigger: input.trigger,
      policySnapshot: input.policySnapshot,
      errorSummary: input.errorSummary ?? null,
    })
    .returning();
  return run!;
}

export async function listRunsForOrg(db: Database, organizationId: string) {
  return db.query.agentRun.findMany({
    where: eq(agentRun.organizationId, organizationId),
    orderBy: [desc(agentRun.createdAt)],
    with: { ticket: true, machine: true },
  });
}

export async function getRunWithDetails(db: Database, runId: string) {
  return db.query.agentRun.findFirst({
    where: eq(agentRun.id, runId),
    with: {
      ticket: true,
      machine: true,
      events: {
        orderBy: (event, { asc }) => [asc(event.seq)],
      },
      artifacts: true,
    },
  });
}

export async function listMachinesForOrg(db: Database, organizationId: string) {
  return db.query.machine.findMany({
    where: eq(machine.organizationId, organizationId),
    orderBy: [desc(machine.lastSeenAt)],
  });
}

export async function listBindingsForOrg(db: Database, organizationId: string) {
  return db.query.repoBinding.findMany({
    where: eq(repoBinding.organizationId, organizationId),
  });
}

export async function cancelActiveRunsForTicket(db: Database, ticketId: string) {
  return db
    .update(agentRun)
    .set({ status: "cancelled", phase: null, updatedAt: new Date() })
    .where(
      and(
        eq(agentRun.ticketId, ticketId),
        inArray(agentRun.status, [
          "needs_info",
          "awaiting_approval",
          "queued",
          "running",
        ]),
      ),
    )
    .returning();
}
