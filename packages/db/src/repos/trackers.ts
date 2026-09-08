import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { membership, repoBinding, trackerConnection } from "../schema/index";
import { newId } from "./workspace";

export type LinearConnectionMetadata = {
  organizationName?: string;
  organizationUrlKey?: string;
  linearOrganizationId?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string;
  actor?: "app" | "user";
};

export async function listTrackerConnections(db: Database, organizationId: string) {
  return db.query.trackerConnection.findMany({
    where: eq(trackerConnection.organizationId, organizationId),
  });
}

export async function findLinearConnection(
  db: Database,
  organizationId: string,
) {
  return db.query.trackerConnection.findFirst({
    where: and(
      eq(trackerConnection.organizationId, organizationId),
      inArray(trackerConnection.kind, ["linear_oauth", "linear_agent"]),
    ),
  });
}

export async function findLinearConnectionByLinearOrg(
  db: Database,
  linearOrganizationId: string,
) {
  return db.query.trackerConnection.findFirst({
    where: and(
      eq(trackerConnection.teamId, linearOrganizationId),
      inArray(trackerConnection.kind, ["linear_oauth", "linear_agent"]),
    ),
  });
}

export async function upsertLinearConnection(
  db: Database,
  input: {
    organizationId: string;
    linearOrganizationId: string;
    accessToken: string;
    metadata: LinearConnectionMetadata;
  },
) {
  const existing = await findLinearConnection(db, input.organizationId);
  const metadata: LinearConnectionMetadata = {
    ...input.metadata,
    linearOrganizationId: input.linearOrganizationId,
  };
  if (existing) {
    const [updated] = await db
      .update(trackerConnection)
      .set({
        kind: "linear_oauth",
        teamId: input.linearOrganizationId,
        secretRef: input.accessToken,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(trackerConnection.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(trackerConnection)
    .values({
      id: newId(),
      organizationId: input.organizationId,
      kind: "linear_oauth",
      teamId: input.linearOrganizationId,
      secretRef: input.accessToken,
      metadata,
    })
    .returning();
  return created!;
}

export async function updateLinearConnectionSecrets(
  db: Database,
  connectionId: string,
  input: { accessToken: string; metadata: LinearConnectionMetadata },
) {
  const [updated] = await db
    .update(trackerConnection)
    .set({
      secretRef: input.accessToken,
      metadata: input.metadata,
      updatedAt: new Date(),
    })
    .where(eq(trackerConnection.id, connectionId))
    .returning();
  return updated ?? null;
}

export async function deleteLinearConnection(db: Database, organizationId: string) {
  return db
    .delete(trackerConnection)
    .where(
      and(
        eq(trackerConnection.organizationId, organizationId),
        inArray(trackerConnection.kind, ["linear_oauth", "linear_agent"]),
      ),
    )
    .returning();
}

export async function findRepoBindingForLinear(
  db: Database,
  input: {
    organizationId: string;
    linearTeamId?: string | null;
    linearProjectId?: string | null;
  },
) {
  const teamId = input.linearTeamId?.trim();
  if (!teamId) return null;

  const candidates = await db.query.repoBinding.findMany({
    where: and(
      eq(repoBinding.organizationId, input.organizationId),
      eq(repoBinding.linearTeamId, teamId),
    ),
  });
  if (candidates.length === 0) return null;

  const projectId = input.linearProjectId?.trim();
  if (projectId) {
    const exact = candidates.find((row) => row.linearProjectId === projectId);
    if (exact) return exact;
  }
  return candidates.find((row) => !row.linearProjectId) ?? candidates[0] ?? null;
}

export async function upsertRepoBinding(
  db: Database,
  input: {
    organizationId: string;
    githubOwner: string;
    githubRepo: string;
    defaultBranch?: string;
    linearTeamId?: string | null;
    linearProjectId?: string | null;
    defaultHarness?: "claude" | "codex" | "cursor";
  },
) {
  const existing = await db.query.repoBinding.findFirst({
    where: and(
      eq(repoBinding.organizationId, input.organizationId),
      eq(repoBinding.githubOwner, input.githubOwner),
      eq(repoBinding.githubRepo, input.githubRepo),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(repoBinding)
      .set({
        defaultBranch: input.defaultBranch ?? existing.defaultBranch,
        linearTeamId: input.linearTeamId ?? null,
        linearProjectId: input.linearProjectId ?? null,
        defaultHarness: input.defaultHarness ?? existing.defaultHarness,
        updatedAt: new Date(),
      })
      .where(eq(repoBinding.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(repoBinding)
    .values({
      id: newId(),
      organizationId: input.organizationId,
      githubOwner: input.githubOwner,
      githubRepo: input.githubRepo,
      defaultBranch: input.defaultBranch ?? "main",
      linearTeamId: input.linearTeamId ?? null,
      linearProjectId: input.linearProjectId ?? null,
      defaultHarness: input.defaultHarness ?? "claude",
    })
    .returning();
  return created!;
}

export async function getRepoBindingById(db: Database, bindingId: string) {
  return db.query.repoBinding.findFirst({
    where: eq(repoBinding.id, bindingId),
  });
}

export async function deleteRepoBinding(
  db: Database,
  input: { organizationId: string; bindingId: string },
) {
  const [removed] = await db
    .delete(repoBinding)
    .where(
      and(
        eq(repoBinding.id, input.bindingId),
        eq(repoBinding.organizationId, input.organizationId),
      ),
    )
    .returning();
  return removed ?? null;
}

export async function countApprovers(db: Database, organizationId: string) {
  const rows = await db.query.membership.findMany({
    where: and(
      eq(membership.organizationId, organizationId),
      inArray(membership.role, ["owner", "approver"]),
    ),
  });
  return rows.length;
}

export async function getOrgOwner(db: Database, organizationId: string) {
  return db.query.membership.findFirst({
    where: and(
      eq(membership.organizationId, organizationId),
      eq(membership.role, "owner"),
    ),
    orderBy: [desc(membership.createdAt)],
  });
}

export async function getMembershipForUser(
  db: Database,
  organizationId: string,
  userId: string,
) {
  return db.query.membership.findFirst({
    where: and(
      eq(membership.organizationId, organizationId),
      eq(membership.userId, userId),
    ),
  });
}
