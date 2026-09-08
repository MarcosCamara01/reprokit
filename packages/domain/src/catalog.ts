export const AGENT_RUN_STATUSES = [
  "needs_info",
  "awaiting_approval",
  "queued",
  "running",
  "pr_open",
  "done",
  "failed",
  "cancelled",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const KANBAN_COLUMNS: AgentRunStatus[] = [...AGENT_RUN_STATUSES];

export const AGENT_RUN_PHASES = [
  "diagnosing",
  "fixing",
  "implementing",
  "verifying",
] as const;

export type AgentRunPhase = (typeof AGENT_RUN_PHASES)[number];

export const PIPELINES = [
  "bug_repro",
  "bug_fix",
  "spec_implement",
  "compare",
] as const;

export type Pipeline = (typeof PIPELINES)[number];

export const HARNESS_IDS = ["claude", "codex", "cursor"] as const;

export type HarnessId = (typeof HARNESS_IDS)[number];

export const TRIGGERS = [
  "slash",
  "web",
  "linear_delegate",
  "label",
  "api",
] as const;

export type Trigger = (typeof TRIGGERS)[number];

export const MEMBERSHIP_ROLES = ["owner", "approver", "member"] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const SPEC_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "superseded",
] as const;

export type SpecStatus = (typeof SPEC_STATUSES)[number];

export const APPROVAL_SUBJECTS = ["spec", "bug_fix", "rerun"] as const;

export type ApprovalSubject = (typeof APPROVAL_SUBJECTS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const TICKET_KINDS = ["bug", "spec", "unknown"] as const;

export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_PROVIDERS = ["github", "linear"] as const;

export type TicketProvider = (typeof TICKET_PROVIDERS)[number];

export const TRACKER_CONNECTION_KINDS = [
  "github_app",
  "linear_oauth",
  "linear_agent",
] as const;

export type TrackerConnectionKind = (typeof TRACKER_CONNECTION_KINDS)[number];

export const MACHINE_STATUSES = ["online", "offline", "pairing"] as const;

export type MachineStatus = (typeof MACHINE_STATUSES)[number];

export const ARTIFACT_KINDS = [
  "repro_report",
  "fix_report",
  "spec",
  "diff_stat",
  "checks",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const DEFAULT_HARNESS: HarnessId = "claude";

export const TERMINAL_STATUSES: AgentRunStatus[] = ["done", "cancelled"];

export const HARNESS_SELECTABLE_STATUSES: AgentRunStatus[] = [
  "needs_info",
  "awaiting_approval",
  "queued",
  "failed",
];

export const LINEAR_MISSING_REPO_REASON =
  "Which GitHub repository should this Linear issue run in? Add a RepoBinding (Linear team/project → GitHub owner/repo) in Settings.";

/** Copy of the approved spec written onto the implementation branch for GitHub review. */
export function specCopyPath(identifier: string): string {
  const safe = identifier.replace(/^#/, "").replace(/[^\w.-]+/g, "-") || "spec";
  return `specs/${safe}.md`;
}

/** Keep artifact branchPath inside specs/*.md; ignore traversal and odd paths. */
export function resolveSpecBranchPath(identifier: string, branchPath?: unknown): string {
  const fallback = specCopyPath(identifier);
  if (typeof branchPath !== "string") return fallback;
  const normalized = branchPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    normalized.includes("..") ||
    !normalized.startsWith("specs/") ||
    !normalized.endsWith(".md") ||
    normalized.includes("//")
  ) {
    return fallback;
  }
  return normalized;
}

export type SpecCopy = {
  path: string;
  markdown: string;
  specId?: string;
  specVersion?: number;
};

export function pickSpecCopy(input: {
  identifier: string;
  artifacts: Array<{
    kind: string;
    excerpt: string;
    metadata?: Record<string, unknown> | null;
  }>;
}): SpecCopy | null {
  const specs = input.artifacts.filter((item) => item.kind === "spec" && item.excerpt.trim().length > 0);
  const preferred = specs.filter((item) => item.metadata?.intent === "write_on_branch");
  const artifact = (preferred.length > 0 ? preferred : specs).at(-1);
  if (!artifact) return null;
  const meta = artifact.metadata ?? {};
  return {
    path: resolveSpecBranchPath(input.identifier, meta.branchPath),
    markdown: artifact.excerpt,
    specId: typeof meta.specId === "string" ? meta.specId : undefined,
    specVersion: typeof meta.specVersion === "number" ? meta.specVersion : undefined,
  };
}
