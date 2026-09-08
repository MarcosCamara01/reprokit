import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "approver",
  "member",
]);

export const machineStatusEnum = pgEnum("machine_status", [
  "online",
  "offline",
  "pairing",
]);

export const trackerKindEnum = pgEnum("tracker_kind", [
  "github_app",
  "linear_oauth",
  "linear_agent",
]);

export const ticketProviderEnum = pgEnum("ticket_provider", ["github", "linear"]);

export const ticketKindEnum = pgEnum("ticket_kind", ["bug", "spec", "unknown"]);

export const specStatusEnum = pgEnum("spec_status", [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "superseded",
]);

export const approvalSubjectEnum = pgEnum("approval_subject", [
  "spec",
  "bug_fix",
  "rerun",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "needs_info",
  "awaiting_approval",
  "queued",
  "running",
  "pr_open",
  "done",
  "failed",
  "cancelled",
]);

export const agentRunPhaseEnum = pgEnum("agent_run_phase", [
  "diagnosing",
  "fixing",
  "implementing",
  "verifying",
]);

export const pipelineEnum = pgEnum("pipeline", [
  "bug_repro",
  "bug_fix",
  "spec_implement",
  "compare",
]);

export const harnessEnum = pgEnum("harness", ["claude", "codex", "cursor"]);

export const triggerEnum = pgEnum("trigger", [
  "slash",
  "web",
  "linear_delegate",
  "label",
  "api",
]);

export const artifactKindEnum = pgEnum("artifact_kind", [
  "repro_report",
  "fix_report",
  "spec",
  "diff_stat",
  "checks",
]);

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const membership = pgTable(
  "membership",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("membership_org_user_idx").on(t.organizationId, t.userId),
    index("membership_user_idx").on(t.userId),
  ],
);

export const machine = pgTable(
  "machine",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: machineStatusEnum("status").notNull().default("pairing"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    capabilities: jsonb("capabilities")
      .$type<{
        harnesses: Array<"claude" | "codex" | "cursor">;
        loggedIn?: Partial<Record<"claude" | "codex" | "cursor", boolean>>;
        versions?: Partial<Record<"claude" | "codex" | "cursor", string>>;
        hostname?: string;
      }>()
      .notNull()
      .default({ harnesses: [] }),
    tokenHash: text("token_hash"),
    ...timestamps,
  },
  (t) => [index("machine_org_idx").on(t.organizationId)],
);

export const trackerConnection = pgTable(
  "tracker_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: trackerKindEnum("kind").notNull(),
    installationId: text("installation_id"),
    teamId: text("team_id"),
    secretRef: text("secret_ref"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("tracker_connection_org_idx").on(t.organizationId)],
);

export const repoBinding = pgTable(
  "repo_binding",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    githubOwner: text("github_owner").notNull(),
    githubRepo: text("github_repo").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    linearTeamId: text("linear_team_id"),
    linearProjectId: text("linear_project_id"),
    defaultHarness: harnessEnum("default_harness").notNull().default("claude"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("repo_binding_github_idx").on(
      t.organizationId,
      t.githubOwner,
      t.githubRepo,
    ),
    index("repo_binding_linear_idx").on(t.linearTeamId, t.linearProjectId),
  ],
);

export const ticket = pgTable(
  "ticket",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    repoBindingId: text("repo_binding_id").references(() => repoBinding.id, {
      onDelete: "set null",
    }),
    provider: ticketProviderEnum("provider").notNull(),
    externalId: text("external_id").notNull(),
    identifier: text("identifier").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    kind: ticketKindEnum("kind").notNull().default("unknown"),
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ticket_provider_external_idx").on(
      t.organizationId,
      t.provider,
      t.externalId,
    ),
    index("ticket_org_idx").on(t.organizationId),
  ],
);

export const spec = pgTable(
  "spec",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    bodyMarkdown: text("body_markdown").notNull(),
    status: specStatusEnum("status").notNull().default("draft"),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("spec_ticket_version_idx").on(t.ticketId, t.version),
    index("spec_status_idx").on(t.status),
  ],
);

export const approval = pgTable(
  "approval",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subject: approvalSubjectEnum("subject").notNull(),
    subjectId: text("subject_id").notNull(),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    approverId: text("approver_id").references(() => user.id, { onDelete: "set null" }),
    status: approvalStatusEnum("status").notNull().default("pending"),
    comment: text("comment"),
    ...timestamps,
  },
  (t) => [
    index("approval_subject_idx").on(t.subject, t.subjectId),
    index("approval_org_idx").on(t.organizationId),
  ],
);

export const agentRun = pgTable(
  "agent_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id").references(() => ticket.id, { onDelete: "set null" }),
    machineId: text("machine_id").references(() => machine.id, {
      onDelete: "set null",
    }),
    pipeline: pipelineEnum("pipeline").notNull(),
    harness: harnessEnum("harness").notNull(),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    phase: agentRunPhaseEnum("phase"),
    trigger: triggerEnum("trigger").notNull(),
    prUrl: text("pr_url"),
    branchName: text("branch_name"),
    errorSummary: text("error_summary"),
    policySnapshot: jsonb("policy_snapshot")
      .$type<{
        defaultHarness: "claude" | "codex" | "cursor";
        concurrentRuns: number;
        autoIntake: boolean;
        specRequiresApproval: boolean;
        pauseAfterRepro: boolean;
      }>()
      .notNull(),
    leasedAt: timestamp("leased_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    index("agent_run_status_idx").on(t.status),
    index("agent_run_org_idx").on(t.organizationId),
    index("agent_run_lease_idx").on(t.status, t.harness, t.machineId),
  ],
);

export const runEvent = pgTable(
  "run_event",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    stream: text("stream").notNull().default("stdout"),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("run_event_seq_idx").on(t.runId, t.seq),
    index("run_event_run_idx").on(t.runId),
  ],
);

export const runArtifact = pgTable(
  "run_artifact",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    kind: artifactKindEnum("kind").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    metadata: jsonb("metadata")
      .$type<{ localPath?: string; [key: string]: unknown }>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("run_artifact_run_idx").on(t.runId)],
);

export const policy = pgTable(
  "policy",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    repoBindingId: text("repo_binding_id").references(() => repoBinding.id, {
      onDelete: "cascade",
    }),
    defaultHarness: harnessEnum("default_harness").notNull().default("claude"),
    concurrentRuns: integer("concurrent_runs").notNull().default(1),
    autoIntake: boolean("auto_intake").notNull().default(false),
    specRequiresApproval: boolean("spec_requires_approval").notNull().default(true),
    pauseAfterRepro: boolean("pause_after_repro").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("policy_org_idx").on(t.organizationId)],
);

export const organizationRelations = relations(organization, ({ many }) => ({
  memberships: many(membership),
  machines: many(machine),
  trackerConnections: many(trackerConnection),
  repoBindings: many(repoBinding),
  tickets: many(ticket),
  runs: many(agentRun),
  policies: many(policy),
  approvals: many(approval),
}));

export const membershipRelations = relations(membership, ({ one }) => ({
  organization: one(organization, {
    fields: [membership.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [membership.userId], references: [user.id] }),
}));

export const machineRelations = relations(machine, ({ one, many }) => ({
  organization: one(organization, {
    fields: [machine.organizationId],
    references: [organization.id],
  }),
  runs: many(agentRun),
}));

export const ticketRelations = relations(ticket, ({ one, many }) => ({
  organization: one(organization, {
    fields: [ticket.organizationId],
    references: [organization.id],
  }),
  repoBinding: one(repoBinding, {
    fields: [ticket.repoBindingId],
    references: [repoBinding.id],
  }),
  specs: many(spec),
  runs: many(agentRun),
}));

export const specRelations = relations(spec, ({ one }) => ({
  ticket: one(ticket, { fields: [spec.ticketId], references: [ticket.id] }),
  author: one(user, { fields: [spec.authorId], references: [user.id] }),
}));

export const agentRunRelations = relations(agentRun, ({ one, many }) => ({
  organization: one(organization, {
    fields: [agentRun.organizationId],
    references: [organization.id],
  }),
  ticket: one(ticket, { fields: [agentRun.ticketId], references: [ticket.id] }),
  machine: one(machine, { fields: [agentRun.machineId], references: [machine.id] }),
  events: many(runEvent),
  artifacts: many(runArtifact),
}));

export const runEventRelations = relations(runEvent, ({ one }) => ({
  run: one(agentRun, { fields: [runEvent.runId], references: [agentRun.id] }),
}));

export const runArtifactRelations = relations(runArtifact, ({ one }) => ({
  run: one(agentRun, { fields: [runArtifact.runId], references: [agentRun.id] }),
}));

export const policyRelations = relations(policy, ({ one }) => ({
  organization: one(organization, {
    fields: [policy.organizationId],
    references: [organization.id],
  }),
  repoBinding: one(repoBinding, {
    fields: [policy.repoBindingId],
    references: [repoBinding.id],
  }),
}));

export const repoBindingRelations = relations(repoBinding, ({ one, many }) => ({
  organization: one(organization, {
    fields: [repoBinding.organizationId],
    references: [organization.id],
  }),
  tickets: many(ticket),
  policies: many(policy),
}));
