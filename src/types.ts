/**
 * Shared domain types for the Issue Repro & Fix Agent.
 *
 * These are intentionally framework-agnostic: the Eve `agent/tools/*` wrappers,
 * the standalone webhook and the CLI all speak in terms of these types.
 */

export type IssueProviderId = "github" | "linear";
export type WorkerProvider = "codex" | "claude";

export interface IssueComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ParsedBug {
  summary: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  reproductionSteps: string[];
  environment?: string;
  suspectedArea?: string;
  needsBrowser?: boolean;
  needsDatabase?: boolean;
  needsAuth?: boolean;
}

export interface IssueRepository {
  owner: string;
  name: string;
  defaultBranch?: string;
  cloneUrl?: string;
}

export interface IssueContext {
  provider: IssueProviderId;
  id: string;
  number?: number;
  url: string;
  title: string;
  body: string;
  labels: string[];
  comments: IssueComment[];
  repository?: IssueRepository;
  parsedBug: ParsedBug;
}

/** Minimal reference used to look up an issue from a provider. */
export interface IssueRef {
  provider: IssueProviderId;
  owner?: string;
  repo?: string;
  /** Provider-native id (issue number as string for GitHub). */
  id: string;
}

// ── Worker IO ────────────────────────────────────────────────────────────────

/**
 * Categories of decision that an autonomous worker must NOT make on its own.
 * When a worker hits one of these it should stop and hand back to a human
 * instead of guessing. Mirrors the SDD "hard stop" / human-approval policy.
 */
export type HardStopCategory =
  | "ambiguous-requirements"
  | "new-dependency"
  | "auth"
  | "payments"
  | "security"
  | "data-loss"
  | "public-api"
  | "external-contract"
  | "out-of-scope"
  | "infeasible"
  | "other";

/**
 * A worker's signal that it deliberately stopped and needs a human decision,
 * as opposed to simply failing. The orchestrator surfaces this on the issue.
 */
export interface HardStop {
  category: HardStopCategory;
  /** Why the worker stopped (what it ran into). */
  reason: string;
  /** The concrete decision or input the worker needs from a human to continue. */
  needs: string;
}

export interface ReproWorkerInput {
  provider: WorkerProvider;
  issue: IssueContext;
  workdir: string;
  timeoutMs: number;
  contextNote?: string;
  /** When true, the worker prompt grants the headless-browser (agent-browser) capability. */
  browser?: boolean;
  /** Extra environment for the worker process (e.g. constrained AGENT_BROWSER_* vars). */
  env?: Record<string, string>;
}

export interface ReproWorkerResult {
  provider: WorkerProvider;
  model: string;
  effort: string;
  reproduced: boolean;
  confidence: number;
  summary: string;
  reproductionSteps: string[];
  commandsRun: string[];
  relevantLogs: string[];
  suspectedFiles: string[];
  suspectedCause?: string;
  createdFiles?: string[];
  modifiedFiles?: string[];
  /** Screenshot paths the worker captured via agent-browser, if any. */
  screenshots?: string[];
  recommendation: string;
  rawOutputPath?: string;
  /** True when this result came from the built-in mock (CLI not available). */
  mocked?: boolean;
  /** Set when the worker deliberately stopped for a human decision. */
  hardStop?: HardStop | null;
}

export interface FixWorkerInput {
  provider: WorkerProvider;
  issue: IssueContext;
  reportPath: string;
  workdir: string;
  branchName: string;
  timeoutMs: number;
  /** When true, the worker prompt grants the headless-browser (agent-browser) capability. */
  browser?: boolean;
  /** Extra environment for the worker process (e.g. constrained AGENT_BROWSER_* vars). */
  env?: Record<string, string>;
}

export interface FixWorkerResult {
  provider: WorkerProvider;
  model: string;
  effort: string;
  fixed: boolean;
  confidence: number;
  summary: string;
  filesChanged: string[];
  testsAddedOrUpdated: string[];
  commandsRun: string[];
  relevantLogs: string[];
  risks: string[];
  recommendation: string;
  /** Screenshot paths the worker captured via agent-browser while verifying the fix, if any. */
  screenshots?: string[];
  mocked?: boolean;
  /** Set when the worker deliberately stopped for a human decision. */
  hardStop?: HardStop | null;
}

export interface ProjectChecksResult {
  success: boolean;
  commandsRun: string[];
  failedCommand?: string;
  logs: string[];
}
