import { and, eq, inArray, sql } from "drizzle-orm";
import {
  HARNESS_IDS,
  HEARTBEAT_TTL_MS,
  isHeartbeatStale,
  isPairingExpired,
  LEASE_EXPIRED_SUMMARY,
  type ArtifactKind,
  type HarnessId,
} from "@atrium/domain";
import type { Database } from "../client";
import {
  agentRun,
  machine,
  repoBinding,
  runArtifact,
  runEvent,
  trackerConnection,
} from "../schema/index";
import { newId } from "./workspace";

export type MachineCapabilities = {
  harnesses: HarnessId[];
  loggedIn?: Partial<Record<HarnessId, boolean>>;
  versions?: Partial<Record<HarnessId, string>>;
  hostname?: string;
};

export async function heartbeatMachine(
  db: Database,
  input: {
    machineId: string;
    capabilities: MachineCapabilities;
  },
) {
  const [updated] = await db
    .update(machine)
    .set({
      status: "online",
      lastSeenAt: new Date(),
      capabilities: input.capabilities,
      updatedAt: new Date(),
    })
    .where(eq(machine.id, input.machineId))
    .returning();
  return updated ?? null;
}

export async function expireStaleMachinesAndLeases(db: Database, now = new Date()) {
  const online = await db.query.machine.findMany({
    where: eq(machine.status, "online"),
  });
  const staleIds: string[] = [];
  for (const row of online) {
    if (isHeartbeatStale(row.lastSeenAt, now, HEARTBEAT_TTL_MS)) {
      staleIds.push(row.id);
      await db
        .update(machine)
        .set({ status: "offline", updatedAt: now })
        .where(eq(machine.id, row.id));
    }
  }

  if (staleIds.length === 0) {
    return { machines: 0, runs: 0 };
  }

  const expired = await db
    .update(agentRun)
    .set({
      status: "failed",
      phase: null,
      errorSummary: LEASE_EXPIRED_SUMMARY,
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(agentRun.status, "running"), inArray(agentRun.machineId, staleIds)))
    .returning({ id: agentRun.id });

  return { machines: staleIds.length, runs: expired.length };
}

export async function leaseQueuedRun(
  db: Database,
  input: { machineId: string; harnesses: HarnessId[] },
) {
  const harnesses = input.harnesses.filter((id) =>
    (HARNESS_IDS as readonly string[]).includes(id),
  ) as HarnessId[];
  if (harnesses.length === 0) return null;

  const harnessIn = sql.join(
    harnesses.map((id) => sql`${id}`),
    sql`, `,
  );

  const result = await db.execute<{ id: string }>(sql`
    UPDATE agent_run AS r
    SET
      status = 'running',
      machine_id = ${input.machineId},
      phase = CASE WHEN r.pipeline = 'spec_implement' THEN 'implementing' ELSE 'diagnosing' END,
      leased_at = NOW(),
      started_at = NOW(),
      updated_at = NOW(),
      error_summary = NULL
    WHERE r.id = (
      SELECT ar.id
      FROM agent_run ar
      WHERE ar.status = 'queued'
        AND ar.harness IN (${harnessIn})
        AND (ar.machine_id IS NULL OR ar.machine_id = ${input.machineId})
        AND NOT EXISTS (
          SELECT 1
          FROM agent_run busy
          WHERE busy.machine_id = ${input.machineId}
            AND busy.status = 'running'
        )
      ORDER BY ar.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING r.id
  `);

  const id = result.rows[0]?.id;
  if (!id) return null;
  return getLeaseJob(db, id);
}

export async function getLeaseJob(db: Database, runId: string) {
  const run = await db.query.agentRun.findFirst({
    where: eq(agentRun.id, runId),
    with: {
      ticket: true,
      machine: true,
    },
  });
  if (!run) return null;

  const binding = run.ticket?.repoBindingId
    ? await db.query.repoBinding.findFirst({
        where: eq(repoBinding.id, run.ticket.repoBindingId),
      })
    : undefined;

  const installation = await db.query.trackerConnection.findFirst({
    where: and(
      eq(trackerConnection.organizationId, run.organizationId),
      eq(trackerConnection.kind, "github_app"),
    ),
  });

  const artifacts = await db.query.runArtifact.findMany({
    where: eq(runArtifact.runId, runId),
  });

  return {
    run,
    ticket: run.ticket ?? null,
    repo: binding
      ? {
          owner: binding.githubOwner,
          repo: binding.githubRepo,
          defaultBranch: binding.defaultBranch,
          cloneUrl: `https://github.com/${binding.githubOwner}/${binding.githubRepo}.git`,
        }
      : null,
    installationId: installation?.installationId ?? null,
    artifacts,
  };
}

export async function appendRunEvents(
  db: Database,
  runId: string,
  events: Array<{ stream?: string; level?: string; message: string }>,
) {
  const last = await db.query.runEvent.findFirst({
    where: eq(runEvent.runId, runId),
    orderBy: (t, { desc }) => [desc(t.seq)],
  });
  let seq = last?.seq ?? 0;
  const rows = events.map((event) => {
    seq += 1;
    return {
      id: newId(),
      runId,
      seq,
      stream: event.stream ?? "stdout",
      level: event.level ?? "info",
      message: event.message,
    };
  });
  if (rows.length === 0) return [];
  return db.insert(runEvent).values(rows).returning();
}

export async function insertRunArtifact(
  db: Database,
  input: {
    runId: string;
    kind: ArtifactKind;
    excerpt: string;
    metadata?: { localPath?: string; [key: string]: unknown };
  },
) {
  const [row] = await db
    .insert(runArtifact)
    .values({
      id: newId(),
      runId: input.runId,
      kind: input.kind,
      excerpt: input.excerpt,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row ?? null;
}

export async function updateRunPhase(
  db: Database,
  input: { runId: string; phase: "diagnosing" | "fixing" | "implementing" | "verifying" | null },
) {
  const [updated] = await db
    .update(agentRun)
    .set({ phase: input.phase, updatedAt: new Date() })
    .where(eq(agentRun.id, input.runId))
    .returning();
  return updated ?? null;
}

export async function updateRunHarness(
  db: Database,
  input: { runId: string; harness: HarnessId; machineId?: string | null },
) {
  const [updated] = await db
    .update(agentRun)
    .set({
      harness: input.harness,
      machineId: input.machineId === undefined ? undefined : input.machineId,
      updatedAt: new Date(),
    })
    .where(eq(agentRun.id, input.runId))
    .returning();
  return updated ?? null;
}

export async function completeRun(
  db: Database,
  input: {
    runId: string;
    status: "pr_open" | "done" | "failed" | "cancelled" | "needs_info" | "awaiting_approval";
    errorSummary?: string | null;
    prUrl?: string | null;
    branchName?: string | null;
  },
) {
  const [updated] = await db
    .update(agentRun)
    .set({
      status: input.status,
      phase: null,
      errorSummary: input.errorSummary ?? null,
      prUrl: input.prUrl ?? undefined,
      branchName: input.branchName ?? undefined,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentRun.id, input.runId))
    .returning();
  return updated ?? null;
}

export async function createPairingMachine(
  db: Database,
  input: { organizationId: string; codeHash: string },
) {
  await db
    .delete(machine)
    .where(and(eq(machine.organizationId, input.organizationId), eq(machine.status, "pairing")));

  const [created] = await db
    .insert(machine)
    .values({
      id: newId(),
      organizationId: input.organizationId,
      name: "waiting to join",
      status: "pairing",
      tokenHash: input.codeHash,
      capabilities: { harnesses: [] },
    })
    .returning();
  return created!;
}

export async function findPairingMachine(db: Database, codeHash: string, now = new Date()) {
  const found = await db.query.machine.findFirst({
    where: and(eq(machine.status, "pairing"), eq(machine.tokenHash, codeHash)),
  });
  if (!found) return null;
  if (isPairingExpired(found.createdAt, now)) return null;
  return found;
}

export async function activatePairedMachine(
  db: Database,
  input: { machineId: string; name: string; tokenHash: string },
) {
  const [updated] = await db
    .update(machine)
    .set({
      name: input.name,
      status: "offline",
      tokenHash: input.tokenHash,
      updatedAt: new Date(),
    })
    .where(eq(machine.id, input.machineId))
    .returning();
  return updated ?? null;
}

export async function getMachineById(db: Database, machineId: string) {
  return db.query.machine.findFirst({ where: eq(machine.id, machineId) });
}

export async function markPrMerged(db: Database, prUrl: string) {
  const [updated] = await db
    .update(agentRun)
    .set({ status: "done", phase: null, updatedAt: new Date() })
    .where(and(eq(agentRun.prUrl, prUrl), eq(agentRun.status, "pr_open")))
    .returning();
  return updated ?? null;
}

export async function upsertGithubInstallation(
  db: Database,
  input: { organizationId: string; installationId: string },
) {
  const existing = await db.query.trackerConnection.findFirst({
    where: and(
      eq(trackerConnection.organizationId, input.organizationId),
      eq(trackerConnection.kind, "github_app"),
    ),
  });
  if (existing) {
    if (existing.installationId === input.installationId) return existing;
    const [updated] = await db
      .update(trackerConnection)
      .set({
        installationId: input.installationId,
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
      kind: "github_app",
      installationId: input.installationId,
    })
    .returning();
  return created!;
}
