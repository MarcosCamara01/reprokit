import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IssueContext, IssueRef, WorkerProvider } from "../types.ts";
import type { IssueProvider } from "../providers/issue-provider.ts";
import type { GitHubClient } from "../github/github-client.ts";
import { triage } from "../providers/parse-bug.ts";
import { ensureRunDirs, runPaths } from "../utils/paths.ts";
import { createLogger, type Logger } from "../utils/logger.ts";
import { redactAndTruncate } from "../utils/redact-secrets.ts";
import {
  loadRunState,
  saveRunState,
  setState,
  type RunStateFile,
} from "./run-store.ts";
import { prepareWorkdir } from "./prepare-workdir.ts";
import { runProjectChecks } from "./project-checks.ts";
import { defaultWorkerProvider, getWorker } from "../workers/index.ts";
import { renderReproductionReport, summarizeReportForComment } from "../reports/reproduction-report.ts";
import { renderCompareReport } from "../reports/compare-report.ts";
import { buildPrBody, commitAndPush, openPullRequest } from "../github/github-pr.ts";
import type { IssueCommand } from "../utils/command-parser.ts";

const COMMENT_MAX = 60_000;

export interface WorkflowConfig {
  workerTimeoutMs: number;
  maxLogChars: number;
  defaultWorker: WorkerProvider;
  install: boolean;
  browserChecks: boolean;
}

export interface WorkflowDeps {
  provider: IssueProvider;
  /** Resolves an authenticated git clone/push URL for an issue's repo (GitHub). */
  resolveGitUrl?: (issue: IssueContext) => string;
  /** GitHub client used to open PRs. Required for real PR creation. */
  client?: GitHubClient;
  config?: Partial<WorkflowConfig>;
  logger?: Logger;
}

function configFromEnv(overrides?: Partial<WorkflowConfig>): WorkflowConfig {
  return {
    workerTimeoutMs: Number(process.env.WORKER_TIMEOUT_MS) || 900_000,
    maxLogChars: Number(process.env.MAX_LOG_CHARS) || 12_000,
    defaultWorker: defaultWorkerProvider(),
    install: process.env.WORKER_INSTALL === "1",
    browserChecks:
      process.env.RUN_BROWSER_CHECKS === "1" ||
      process.env.RUN_PLAYWRIGHT_CHECKS === "1",
    ...overrides,
  };
}

const now = () => new Date().toISOString();

/**
 * Orchestrates a single issue across its lifecycle. This is the framework-agnostic
 * core; the Eve agent tools, the standalone webhook and the CLI all call into it.
 */
export class IssueWorkflow {
  private readonly provider: IssueProvider;
  private readonly resolveGitUrl?: (issue: IssueContext) => string;
  private readonly client?: GitHubClient;
  private readonly config: WorkflowConfig;
  private readonly log: Logger;

  constructor(deps: WorkflowDeps) {
    this.provider = deps.provider;
    this.resolveGitUrl = deps.resolveGitUrl;
    this.client = deps.client;
    this.config = configFromEnv(deps.config);
    this.log = deps.logger ?? createLogger("workflow");
  }

  /** Entry point: dispatch a parsed command. */
  async dispatch(ref: IssueRef, command: IssueCommand): Promise<void> {
    this.log.info(`Dispatching command`, { id: ref.id, command });
    switch (command.type) {
      case "repro":
        await this.runRepro(ref);
        return;
      case "fix":
        await this.runFix(ref, command.provider);
        return;
      case "compare":
        await this.runCompare(ref);
        return;
      case "stop":
        await this.stop(ref);
        return;
      case "unknown":
        this.log.warn("Ignoring unknown command", { raw: command.raw });
        return;
    }
  }

  // ── /repro ───────────────────────────────────────────────────────────────
  async runRepro(ref: IssueRef): Promise<void> {
    const issue = await this.provider.getIssue(ref.id);
    const key = issue.number ?? issue.id;
    let state = this.initState(issue);

    const t = triage(issue.parsedBug);
    if (!t.hasEnoughInfo) {
      await this.provider.postComment(ref.id, missingInfoComment(t.missing));
      this.transition(key, state, "NEEDS_MORE_INFO", "insufficient info for repro");
      return;
    }
    state = this.transition(key, state, "TRIAGED");

    const paths = runPaths(key);
    ensureRunDirs(paths);
    const runLog = this.log.child(`issue-${key}`);

    // Prepare an isolated checkout (best-effort; mock workers don't need it).
    try {
      if (this.resolveGitUrl) {
        await prepareWorkdir({
          issue,
          repoDir: paths.repo,
          cloneUrl: this.resolveGitUrl(issue),
          install: this.config.install,
          logger: runLog,
        });
      } else {
        runLog.warn("No git access configured — skipping clone (workers may mock).");
      }
    } catch (err) {
      runLog.warn("Workdir preparation failed; continuing.", { error: String(err) });
    }
    state = this.transition(key, state, "ENV_PREPARED");

    const worker = getWorker(this.config.defaultWorker);
    state = this.transition(key, state, "REPRO_RUNNING", `worker=${worker.provider}`);
    const result = await worker.runRepro({
      provider: worker.provider,
      issue,
      workdir: paths.repo,
      timeoutMs: this.config.workerTimeoutMs,
    });

    state = this.transition(
      key,
      state,
      result.reproduced ? "REPRODUCED" : "NOT_REPRODUCED",
      `confidence=${result.confidence}`,
    );

    const report = renderReproductionReport({
      issue,
      result,
      environment: issue.parsedBug.environment,
    });
    writeFileSync(paths.report, report);
    state = { ...state, reportPath: paths.report, worker: worker.provider };
    saveRunState(key, state);

    const { body } = summarizeReportForComment(report, COMMENT_MAX);
    await this.provider.postComment(ref.id, body);
    state = this.transition(key, state, "REPORT_POSTED");
    this.transition(key, state, "WAITING_FOR_APPROVAL", "awaiting /fix approval");
  }

  // ── /fix ─────────────────────────────────────────────────────────────────
  async runFix(ref: IssueRef, providerOverride?: WorkerProvider): Promise<void> {
    const issue = await this.provider.getIssue(ref.id);
    const key = issue.number ?? issue.id;
    const existing = loadRunState(key);

    // Human-in-the-loop gate: a reproduction report must exist first.
    if (
      !existing ||
      !["REPORT_POSTED", "WAITING_FOR_APPROVAL", "FIX_FAILED"].includes(existing.state)
    ) {
      await this.provider.postComment(
        ref.id,
        "I can't start a fix yet — there's no reproduction report for this issue. " +
          "Please run `/repro` first, review the report, then comment `/fix`.",
      );
      return;
    }

    let state = existing;
    const workerProvider =
      providerOverride ?? (state.worker as WorkerProvider) ?? this.config.defaultWorker;
    const worker = getWorker(workerProvider);
    const paths = runPaths(key);
    const runLog = this.log.child(`issue-${key}:fix`);
    const branchName = `agent/fix-issue-${issue.number ?? issue.id}`;

    // Ensure a checkout exists for the worker to edit.
    if (!existsSync(paths.repo) && this.resolveGitUrl) {
      await prepareWorkdir({
        issue,
        repoDir: paths.repo,
        cloneUrl: this.resolveGitUrl(issue),
        install: this.config.install,
        logger: runLog,
      }).catch((e) => runLog.warn("clone failed", { error: String(e) }));
    }

    state = setState(key, state, "FIX_RUNNING", `worker=${workerProvider}`, now());

    const reportPath = state.reportPath ?? paths.report;
    const fix = await worker.runFix({
      provider: workerProvider,
      issue,
      reportPath,
      workdir: paths.repo,
      branchName,
      timeoutMs: this.config.workerTimeoutMs,
    });

    if (!fix.fixed) {
      setState(key, state, "FIX_FAILED", "worker did not produce a fix", now());
      await this.provider.postComment(ref.id, this.fixFailureComment(fix.summary, fix.recommendation, fix.relevantLogs));
      return;
    }

    // Validation gate.
    state = setState(key, state, "TESTING", undefined, now());
    const checks = await runProjectChecks({
      repoDir: paths.repo,
      maxLogChars: this.config.maxLogChars,
      includeBrowserChecks: this.config.browserChecks,
      logger: runLog,
    });

    if (!checks.success) {
      setState(key, state, "FIX_FAILED", `checks failed: ${checks.failedCommand}`, now());
      await this.provider.postComment(
        ref.id,
        this.checksFailedComment(checks.failedCommand, checks.logs),
      );
      return;
    }

    // Create branch + PR (only if we have git + client access).
    if (!this.client || !this.resolveGitUrl) {
      setState(key, state, "FIX_FAILED", "no GitHub write access to open PR", now());
      await this.provider.postComment(
        ref.id,
        `✅ The ${workerProvider} worker produced a fix and all checks passed, but I have no ` +
          "GitHub write access configured to push a branch / open a PR.\n\n" +
          "Changed files:\n" +
          (fix.filesChanged.map((f) => `- \`${f}\``).join("\n") || "_unknown_"),
      );
      return;
    }

    const push = await commitAndPush({
      repoDir: paths.repo,
      branchName,
      commitMessage: `fix: resolve issue #${issue.number}`,
      pushUrl: this.resolveGitUrl(issue),
      logger: runLog,
    });

    if (!push.pushed) {
      setState(key, state, "FIX_FAILED", push.note ?? "push failed", now());
      await this.provider.postComment(
        ref.id,
        `⚠️ The fix passed checks but I couldn't push it: ${push.note ?? "unknown error"}`,
      );
      return;
    }

    const repo = issue.repository!;
    const pr = await openPullRequest({
      client: this.client,
      owner: repo.owner,
      repo: repo.name,
      branchName,
      baseBranch: repo.defaultBranch ?? "main",
      title: `fix: ${issue.title}`,
      body: buildPrBody({
        issueNumber: issue.number!,
        issueUrl: issue.url,
        bugSummary: issue.parsedBug.summary,
        reproductionSteps: issue.parsedBug.reproductionSteps,
        fixSummary: fix.summary,
        checks: checks.commandsRun,
        risks: fix.risks,
      }),
    });

    state = { ...setState(key, state, "PR_CREATED", `pr=${pr.url}`, now()), prUrl: pr.url, branchName };
    saveRunState(key, state);

    await this.provider.postComment(ref.id, this.prCreatedComment(pr.url, fix, checks.commandsRun));
    if (this.provider.createLinkedPr) await this.provider.createLinkedPr(ref.id, pr.url);
  }

  // ── /compare ───────────────────────────────────────────────────────────────
  async runCompare(ref: IssueRef): Promise<void> {
    const issue = await this.provider.getIssue(ref.id);
    const key = issue.number ?? issue.id;
    const paths = runPaths(key);
    ensureRunDirs(paths);
    const runLog = this.log.child(`issue-${key}:compare`);

    const providers: WorkerProvider[] = ["codex", "claude"];
    const results = [];
    for (const p of providers) {
      const repoDir = paths.workerRepo(p);
      if (this.resolveGitUrl) {
        await prepareWorkdir({
          issue,
          repoDir,
          cloneUrl: this.resolveGitUrl(issue),
          install: this.config.install,
          logger: runLog.child(p),
        }).catch((e) => runLog.warn(`clone failed for ${p}`, { error: String(e) }));
      }
      const worker = getWorker(p);
      const res = await worker.runRepro({
        provider: p,
        issue,
        workdir: repoDir,
        timeoutMs: this.config.workerTimeoutMs,
      });
      results.push(res);
    }

    const [codex, claude] = results;
    const report = renderCompareReport({
      issueTitle: issue.title,
      issueUrl: issue.url,
      codex: codex!,
      claude: claude!,
    });
    writeFileSync(runPaths(key).report.replace("report.md", "compare-report.md"), report);
    await this.provider.postComment(ref.id, report);
  }

  // ── /stop ──────────────────────────────────────────────────────────────────
  async stop(ref: IssueRef): Promise<void> {
    const issue = await this.provider.getIssue(ref.id).catch(() => null);
    const key = issue?.number ?? ref.id;
    const existing = loadRunState(key);
    if (existing) setState(key, existing, "STOPPED", "stopped by user", now());
    await this.provider.postComment(ref.id, "🛑 Stopped. I won't take further action on this issue until you comment `/repro` or `/fix` again.");
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private initState(issue: IssueContext): RunStateFile {
    const key = issue.number ?? issue.id;
    const existing = loadRunState(key);
    if (existing) return existing;
    const fresh: RunStateFile = {
      issue: {
        provider: issue.provider,
        owner: issue.repository?.owner,
        repo: issue.repository?.name,
        id: issue.id,
        number: issue.number,
        url: issue.url,
        title: issue.title,
      },
      state: "NEW_ISSUE",
      history: [{ state: "NEW_ISSUE" }],
      updatedAt: now(),
    };
    saveRunState(key, fresh);
    return fresh;
  }

  private transition(
    key: string | number,
    state: RunStateFile,
    next: Parameters<typeof setState>[2],
    note?: string,
  ): RunStateFile {
    return setState(key, state, next, note, now());
  }

  private fixFailureComment(summary: string, recommendation: string, logs: string[]): string {
    return `❌ I attempted a fix but it did not succeed.

**Summary:** ${summary || "_none_"}

**Recommendation:** ${recommendation || "_none_"}

${logs.length ? "**Logs:**\n```\n" + redactAndTruncate(logs.join("\n"), this.config.maxLogChars) + "\n```" : ""}

No PR was created.`;
  }

  private checksFailedComment(failedCommand: string | undefined, logs: string[]): string {
    return `❌ A fix was produced but **project checks failed**, so I did not open a PR.

**Failed command:** \`${failedCommand ?? "unknown"}\`

**Logs:**
\`\`\`
${redactAndTruncate(logs.join("\n\n"), this.config.maxLogChars)}
\`\`\`

Reply \`/fix\` to retry, or fix the report and try again.`;
  }

  private prCreatedComment(
    prUrl: string,
    fix: { provider: string; summary: string; risks: string[] },
    checks: string[],
  ): string {
    return `✅ Fix ready for review — **PR not auto-merged.**

**Pull request:** ${prUrl}
**Worker:** ${fix.provider}

**Summary:** ${fix.summary}

**Checks passed:**
${checks.map((c) => `- \`${c}\``).join("\n") || "_none_"}

${fix.risks.length ? "**Risks:**\n" + fix.risks.map((r) => `- ${r}`).join("\n") : ""}`;
  }
}

function missingInfoComment(missing: string[]): string {
  const list = (missing.length ? missing : ["steps to reproduce", "expected behavior", "actual behavior"])
    .map((m, i) => `${i + 1}. ${m.charAt(0).toUpperCase()}${m.slice(1)}`)
    .join("\n");
  return `I need more information before trying to reproduce this bug.

Please provide:

${list}
4. Browser/device, if relevant
5. Screenshots or logs, if available

Then comment \`/repro\` again.`;
}

export function readReportFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
