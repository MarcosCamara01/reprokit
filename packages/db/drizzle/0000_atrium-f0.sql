CREATE TYPE "public"."agent_run_phase" AS ENUM('diagnosing', 'fixing', 'implementing', 'verifying');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('needs_info', 'awaiting_approval', 'queued', 'running', 'pr_open', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approval_subject" AS ENUM('spec', 'bug_fix', 'rerun');--> statement-breakpoint
CREATE TYPE "public"."artifact_kind" AS ENUM('repro_report', 'fix_report', 'spec', 'diff_stat', 'checks');--> statement-breakpoint
CREATE TYPE "public"."harness" AS ENUM('claude', 'codex', 'cursor');--> statement-breakpoint
CREATE TYPE "public"."machine_status" AS ENUM('online', 'offline', 'pairing');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'approver', 'member');--> statement-breakpoint
CREATE TYPE "public"."pipeline" AS ENUM('bug_repro', 'bug_fix', 'spec_implement', 'compare');--> statement-breakpoint
CREATE TYPE "public"."spec_status" AS ENUM('draft', 'in_review', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."ticket_kind" AS ENUM('bug', 'spec', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ticket_provider" AS ENUM('github', 'linear');--> statement-breakpoint
CREATE TYPE "public"."tracker_kind" AS ENUM('github_app', 'linear_oauth', 'linear_agent');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('slash', 'web', 'linear_delegate', 'label', 'api');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ticket_id" text,
	"machine_id" text,
	"pipeline" "pipeline" NOT NULL,
	"harness" "harness" NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"phase" "agent_run_phase",
	"trigger" "run_trigger" NOT NULL,
	"pr_url" text,
	"branch_name" text,
	"error_summary" text,
	"policy_snapshot" jsonb NOT NULL,
	"leased_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subject" "approval_subject" NOT NULL,
	"subject_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"approver_id" text,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "machine_status" DEFAULT 'pairing' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"capabilities" jsonb DEFAULT '{"harnesses":[]}'::jsonb NOT NULL,
	"token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "policy" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"repo_binding_id" text,
	"default_harness" "harness" DEFAULT 'claude' NOT NULL,
	"concurrent_runs" integer DEFAULT 1 NOT NULL,
	"auto_intake" boolean DEFAULT false NOT NULL,
	"spec_requires_approval" boolean DEFAULT true NOT NULL,
	"pause_after_repro" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"github_owner" text NOT NULL,
	"github_repo" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"linear_team_id" text,
	"linear_project_id" text,
	"default_harness" "harness" DEFAULT 'claude' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"kind" "artifact_kind" NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_event" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"stream" text DEFAULT 'stdout' NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spec" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"body_markdown" text NOT NULL,
	"status" "spec_status" DEFAULT 'draft' NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"repo_binding_id" text,
	"provider" "ticket_provider" NOT NULL,
	"external_id" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"kind" "ticket_kind" DEFAULT 'unknown' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" "tracker_kind" NOT NULL,
	"installation_id" text,
	"team_id" text,
	"secret_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machine"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine" ADD CONSTRAINT "machine_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_repo_binding_id_repo_binding_id_fk" FOREIGN KEY ("repo_binding_id") REFERENCES "public"."repo_binding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_binding" ADD CONSTRAINT "repo_binding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifact" ADD CONSTRAINT "run_artifact_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec" ADD CONSTRAINT "spec_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec" ADD CONSTRAINT "spec_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_repo_binding_id_repo_binding_id_fk" FOREIGN KEY ("repo_binding_id") REFERENCES "public"."repo_binding"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_connection" ADD CONSTRAINT "tracker_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "agent_run_status_idx" ON "agent_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_run_org_idx" ON "agent_run" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_run_lease_idx" ON "agent_run" USING btree ("status","harness","machine_id");--> statement-breakpoint
CREATE INDEX "approval_subject_idx" ON "approval" USING btree ("subject","subject_id");--> statement-breakpoint
CREATE INDEX "approval_org_idx" ON "approval" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "machine_org_idx" ON "machine" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_user_idx" ON "membership" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "policy_org_idx" ON "policy" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_binding_github_idx" ON "repo_binding" USING btree ("organization_id","github_owner","github_repo");--> statement-breakpoint
CREATE INDEX "repo_binding_linear_idx" ON "repo_binding" USING btree ("linear_team_id","linear_project_id");--> statement-breakpoint
CREATE INDEX "run_artifact_run_idx" ON "run_artifact" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_event_seq_idx" ON "run_event" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "run_event_run_idx" ON "run_event" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spec_ticket_version_idx" ON "spec" USING btree ("ticket_id","version");--> statement-breakpoint
CREATE INDEX "spec_status_idx" ON "spec" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_provider_external_idx" ON "ticket" USING btree ("organization_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "ticket_org_idx" ON "ticket" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tracker_connection_org_idx" ON "tracker_connection" USING btree ("organization_id");