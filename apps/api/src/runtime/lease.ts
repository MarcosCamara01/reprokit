import type { ArtifactKind, HarnessId } from "@atrium/domain";
import {
  HEARTBEAT_INTERVAL_MS,
  LEASE_WAIT_MS,
  redactEventMessage,
} from "@atrium/domain";
import {
  activatePairedMachine,
  appendRunEvents,
  completeRun,
  expireStaleMachinesAndLeases,
  findPairingMachine,
  getDb,
  getLeaseJob,
  getMachineById,
  heartbeatMachine,
  insertRunArtifact,
  isDatabaseConfigured,
  leaseQueuedRun,
  updateRunPhase,
} from "@atrium/db";
import { commentOnIssue, mintInstallationToken, openPullRequest } from "../github/index";
import { bearerToken, hashToken, signMachineJwt, tokensEqual, verifyMachineJwt } from "./jwt";

export { HEARTBEAT_INTERVAL_MS, LEASE_WAIT_MS };

export type RuntimeAuth = { machineId: string; organizationId: string };

export async function authenticateMachine(
  authorization: string | null,
): Promise<RuntimeAuth> {
  const token = bearerToken(authorization);
  if (!token) throw Object.assign(new Error("missing machine bearer token"), { status: 401 });
  const claims = await verifyMachineJwt(token);
  const db = requireDb();
  const row = await getMachineById(db, claims.machineId);
  if (!row) throw Object.assign(new Error("unknown machine"), { status: 401 });
  if (row.tokenHash && !tokensEqual(row.tokenHash, hashToken(token))) {
    throw Object.assign(new Error("machine token revoked"), { status: 401 });
  }
  return { machineId: claims.machineId, organizationId: row.organizationId };
}

function requireDb() {
  if (!isDatabaseConfigured()) {
    throw Object.assign(new Error("DATABASE_URL is not set"), { status: 503 });
  }
  return getDb();
}

export async function handleHeartbeat(input: {
  authorization: string | null;
  body: {
    capabilities?: {
      harnesses?: HarnessId[];
      loggedIn?: Partial<Record<HarnessId, boolean>>;
      versions?: Partial<Record<HarnessId, string>>;
      hostname?: string;
    };
  };
}) {
  const auth = await authenticateMachine(input.authorization);
  const db = requireDb();
  await expireStaleMachinesAndLeases(db);
  const updated = await heartbeatMachine(db, {
    machineId: auth.machineId,
    capabilities: {
      harnesses: input.body.capabilities?.harnesses ?? [],
      loggedIn: input.body.capabilities?.loggedIn,
      versions: input.body.capabilities?.versions,
      hostname: input.body.capabilities?.hostname,
    },
  });
  return { machine: updated, ok: Boolean(updated) };
}

export async function handleLease(input: {
  authorization: string | null;
  body?: { harnesses?: HarnessId[] };
  waitMs?: number;
}) {
  const auth = await authenticateMachine(input.authorization);
  const db = requireDb();
  await expireStaleMachinesAndLeases(db);
  const harnesses = input.body?.harnesses ?? ["claude", "codex", "cursor"];
  const deadline = Date.now() + (input.waitMs ?? LEASE_WAIT_MS);

  while (Date.now() <= deadline) {
    const leased = await leaseQueuedRun(db, {
      machineId: auth.machineId,
      harnesses,
    });
    if (leased) return { job: leased };
    await sleep(Math.min(1_000, Math.max(0, deadline - Date.now())));
  }
  return { job: null };
}

export async function handleEvents(input: {
  authorization: string | null;
  body: {
    runId: string;
    events: Array<{ stream?: string; level?: string; message: string }>;
  };
}) {
  await authenticateMachine(input.authorization);
  const db = requireDb();
  const rows = await appendRunEvents(
    db,
    input.body.runId,
    input.body.events.map((event) => ({
      ...event,
      message: redactEventMessage(event.message),
    })),
  );
  return { appended: rows.length };
}

export async function handleProgress(input: {
  authorization: string | null;
  body: { runId: string; phase: "diagnosing" | "fixing" | "implementing" | "verifying" };
}) {
  await authenticateMachine(input.authorization);
  const db = requireDb();
  const run = await updateRunPhase(db, input.body);
  return { run };
}

export async function handleArtifact(input: {
  authorization: string | null;
  body: {
    runId: string;
    kind: ArtifactKind;
    excerpt: string;
    metadata?: { localPath?: string; [key: string]: unknown };
  };
}) {
  await authenticateMachine(input.authorization);
  const db = requireDb();
  const row = await insertRunArtifact(db, {
    runId: input.body.runId,
    kind: input.body.kind,
    excerpt: redactEventMessage(input.body.excerpt, 20_000),
    metadata: input.body.metadata,
  });
  return { artifact: row };
}

export async function handleComplete(input: {
  authorization: string | null;
  body: {
    runId: string;
    status: "pr_open" | "done" | "failed" | "cancelled" | "needs_info" | "awaiting_approval";
    errorSummary?: string | null;
    prUrl?: string | null;
    branchName?: string | null;
    questions?: string[];
  };
}) {
  await authenticateMachine(input.authorization);
  const db = requireDb();
  const summary = input.body.errorSummary
    ? redactEventMessage(input.body.errorSummary, 4_000)
    : null;
  const run = await completeRun(db, { ...input.body, errorSummary: summary });

  if (run && input.body.status === "needs_info") {
    const job = await getLeaseJob(db, run.id);
    const questions =
      input.body.questions && input.body.questions.length > 0
        ? input.body.questions
        : [summary ?? "Need more information to continue."];
    await maybeComment(job, needsInfoComment(questions, run.id));
  }

  return { run };
}

export async function handleGitCredentials(input: {
  authorization: string | null;
  body: { runId: string };
}) {
  const auth = await authenticateMachine(input.authorization);
  const db = requireDb();
  const job = await getLeaseJob(db, input.body.runId);
  if (!job?.run || job.run.machineId !== auth.machineId) {
    throw Object.assign(new Error("run is not leased to this machine"), { status: 403 });
  }
  if (!job.repo || !job.installationId) {
    throw Object.assign(new Error("no GitHub installation token available for this run"), {
      status: 409,
    });
  }
  const minted = await mintInstallationToken(job.installationId);
  return {
    token: minted.token,
    expiresAt: minted.expiresAt,
    username: "x-access-token",
    owner: job.repo.owner,
    repo: job.repo.repo,
    defaultBranch: job.repo.defaultBranch,
    cloneUrl: job.repo.cloneUrl,
  };
}

export async function handleOpenPr(input: {
  authorization: string | null;
  body: { runId: string; branch: string; title: string; body: string };
}) {
  const auth = await authenticateMachine(input.authorization);
  const db = requireDb();
  const job = await getLeaseJob(db, input.body.runId);
  if (!job?.run || job.run.machineId !== auth.machineId) {
    throw Object.assign(new Error("run is not leased to this machine"), { status: 403 });
  }
  if (!job.repo || !job.installationId) {
    throw Object.assign(new Error("cannot open PR without a GitHub installation"), { status: 409 });
  }
  const appUrl = process.env.BETTER_AUTH_URL ?? "";
  const runUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/runs/${job.run.id}` : "";
  const pr = await openPullRequest({
    installationId: job.installationId,
    owner: job.repo.owner,
    repo: job.repo.repo,
    title: input.body.title,
    body: [
      input.body.body,
      "",
      runUrl ? `Atrium run: ${runUrl}` : "",
      "Atrium never merges. Human review is required.",
    ]
      .filter(Boolean)
      .join("\n"),
    head: input.body.branch,
    base: job.repo.defaultBranch,
  });
  await maybeComment(job, `Opened [${pr.url}](${pr.url})${runUrl ? `\n\nRun: ${runUrl}` : ""}`);
  return { pr };
}

export async function handleJoin(input: { body: { code: string; name?: string } }) {
  const code = input.body.code?.replace(/\D/g, "");
  if (!code || code.length !== 6) {
    throw Object.assign(new Error("pairing code must be 6 digits"), { status: 400 });
  }
  const db = requireDb();
  const pending = await findPairingMachine(db, hashToken(code));
  if (!pending) {
    throw Object.assign(new Error("invalid or expired pairing code"), { status: 401 });
  }
  const token = await signMachineJwt(pending.id);
  const updated = await activatePairedMachine(db, {
    machineId: pending.id,
    name: input.body.name?.trim() || pending.name,
    tokenHash: hashToken(token),
  });
  return { token, machineId: pending.id, machine: updated };
}

export async function handleExpireLeases() {
  const db = requireDb();
  return expireStaleMachinesAndLeases(db);
}

function needsInfoComment(questions: string[], runId: string): string {
  const appUrl = process.env.BETTER_AUTH_URL ?? "";
  const runUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/runs/${runId}` : "";
  return [
    "Atrium needs more information before continuing:",
    ...questions.map((question) => `- ${question}`),
    runUrl ? `\nRun: ${runUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function maybeComment(
  job: Awaited<ReturnType<typeof getLeaseJob>>,
  body: string,
): Promise<void> {
  if (!job?.repo || !job.installationId || !job.ticket) return;
  const number = Number(job.ticket.identifier.replace(/^#/, ""));
  if (!Number.isFinite(number)) return;
  try {
    await commentOnIssue({
      installationId: job.installationId,
      owner: job.repo.owner,
      repo: job.repo.repo,
      issueNumber: number,
      body,
    });
  } catch {
    // Comment is best-effort; the run status is already persisted.
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
