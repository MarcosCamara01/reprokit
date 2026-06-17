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

export interface ReproWorkerInput {
  provider: WorkerProvider;
  issue: IssueContext;
  workdir: string;
  timeoutMs: number;
}

export interface ReproWorkerResult {
  provider: WorkerProvider;
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
  recommendation: string;
  rawOutputPath?: string;
  /** True when this result came from the built-in mock (CLI not available). */
  mocked?: boolean;
}

export interface FixWorkerInput {
  provider: WorkerProvider;
  issue: IssueContext;
  reportPath: string;
  workdir: string;
  branchName: string;
  timeoutMs: number;
}

export interface FixWorkerResult {
  provider: WorkerProvider;
  fixed: boolean;
  confidence: number;
  summary: string;
  filesChanged: string[];
  testsAddedOrUpdated: string[];
  commandsRun: string[];
  relevantLogs: string[];
  risks: string[];
  recommendation: string;
  mocked?: boolean;
}

export interface ProjectChecksResult {
  success: boolean;
  commandsRun: string[];
  failedCommand?: string;
  logs: string[];
}
