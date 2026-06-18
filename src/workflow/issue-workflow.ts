import { readFileSync, writeFileSync } from "node:fs";
import type {
  FixWorkerResult,
  IssueContext,
  IssueRef,
  ProjectChecksResult,
  ReproWorkerResult,
  WorkerProvider,
} from "../types.ts";
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
    let state = this.initState(issue);
    const workerProvider =
      providerOverride ?? (state.worker as WorkerProvider) ?? this.config.defaultWorker;
    const worker = getWorker(workerProvider);
    const paths = runPaths(key);
    ensureRunDirs(paths);
    const runLog = this.log.child(`issue-${key}:fix`);
    const branchName = `agent/fix-issue-${issue.number ?? issue.id}`;

    const t = triage(issue.parsedBug);
    if (!t.hasEnoughInfo) {
      await this.provider.postComment(ref.id, missingInfoComment(t.missing));
      this.transition(key, state, "NEEDS_MORE_INFO", "insufficient info for fix pipeline");
      return;
    }
    state = this.transition(key, state, "TRIAGED", "starting /fix pipeline");

    if (this.resolveGitUrl) {
      await prepareWorkdir({
        issue,
        repoDir: paths.repo,
        cloneUrl: this.resolveGitUrl(issue),
        install: this.config.install,
        logger: runLog,
      }).catch((e) => runLog.warn("clone failed", { error: String(e) }));
    } else {
      runLog.warn("No git access configured - skipping clone (workers may mock).");
    }
    state = this.transition(key, state, "ENV_PREPARED", "pre-fix reproduction checkout ready");

    state = this.transition(key, state, "REPRO_RUNNING", `pre-fix worker=${worker.provider}`);
    const preFixRepro = await worker.runRepro({
      provider: worker.provider,
      issue,
      workdir: paths.repo,
      timeoutMs: this.config.workerTimeoutMs,
    });

    state = this.transition(
      key,
      state,
      preFixRepro.reproduced ? "REPRODUCED" : "NOT_REPRODUCED",
      `pre-fix confidence=${preFixRepro.confidence}`,
    );

    const preFixReport = renderReproductionReport({
      issue,
      result: preFixRepro,
      environment: issue.parsedBug.environment,
    });
    writeFileSync(paths.report, preFixReport);
    state = { ...state, reportPath: paths.report, worker: worker.provider };
    saveRunState(key, state);
    await this.postReportComment(ref.id, preFixReport);
    state = this.transition(key, state, "REPORT_POSTED", "pre-fix reproduction report posted");

    if (!preFixRepro.reproduced) {
      this.transition(key, state, "FIX_FAILED", "pre-fix reproduction did not reproduce");
      await this.provider.postComment(
        ref.id,
        this.blockedComment({
          title: "Fix stopped before code changes",
          reason:
            "The agent could not reproduce the bug, so applying a fix would be guesswork.",
          nextSteps: [
            "Add clearer steps, expected behavior, actual behavior, logs, or a failing test.",
            "Comment with /fix again after the issue has enough evidence.",
            "Use /compare if you want both workers to attempt an independent diagnosis.",
          ],
        }),
      );
      return;
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
      state = setState(key, state, "FIX_FAILED", "worker did not produce a fix", now());
      const fixReport = this.renderFixReport({
        issue,
        fix,
        status: "failed",
        blockedReason: "The worker did not produce code changes that it considered a fix.",
        nextSteps: [
          fix.recommendation || "Review the reproduction report and improve the issue details.",
          "Retry with /fix codex or /fix claude if another worker is available.",
          "Fix manually if the worker cannot make progress.",
        ],
      });
      writeFileSync(this.fixReportPath(paths.report), fixReport);
      await this.postReportComment(ref.id, fixReport);
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
      state = setState(key, state, "FIX_FAILED", `checks failed: ${checks.failedCommand}`, now());
      const fixReport = this.renderFixReport({
        issue,
        fix,
        checks,
        status: "checks_failed",
        blockedReason: `Project checks failed at ${checks.failedCommand ?? "an unknown command"}.`,
        nextSteps: [
          "Inspect the failing check logs in this report.",
          "Update the fix or tests so the project checks pass.",
          "Comment with /fix again to retry the full pipeline.",
        ],
      });
      writeFileSync(this.fixReportPath(paths.report), fixReport);
      await this.postReportComment(ref.id, fixReport);
      return;
    }

    const fixReport = this.renderFixReport({
      issue,
      fix,
      checks,
      status: "checks_passed",
      nextSteps: ["Running post-fix reproduction verification before opening a PR."],
    });
    writeFileSync(this.fixReportPath(paths.report), fixReport);
    await this.postReportComment(ref.id, fixReport);

    state = setState(key, state, "REPRO_RUNNING", `post-fix verification worker=${worker.provider}`, now());
    const postFixRepro = await worker.runRepro({
      provider: worker.provider,
      issue,
      workdir: paths.repo,
      timeoutMs: this.config.workerTimeoutMs,
    });

    state = setState(
      key,
      state,
      postFixRepro.reproduced ? "REPRODUCED" : "NOT_REPRODUCED",
      `post-fix confidence=${postFixRepro.confidence}`,
      now(),
    );

    const verificationReport = this.renderVerificationReport(issue, postFixRepro);
    writeFileSync(this.verificationReportPath(paths.report), verificationReport);
    await this.postReportComment(ref.id, verificationReport);

    if (postFixRepro.reproduced) {
      state = setState(key, state, "FIX_FAILED", "post-fix reproduction still fails", now());
      await this.provider.postComment(
        ref.id,
        this.blockedComment({
          title: "Fix stopped after verification",
          reason:
            "The worker produced a fix and checks passed, but the post-fix reproduction still reproduced the bug.",
          nextSteps: [
            "Review the post-fix verification report to see what still fails.",
            "Improve the fix manually or comment with /fix again for another attempt.",
            "Use /compare if you want a second diagnosis before retrying.",
          ],
        }),
      );
      return;
    }

    // Create branch + PR (only if we have git + client access).
    if (!this.client || !this.resolveGitUrl) {
      setState(key, state, "FIX_FAILED", "no GitHub write access to open PR", now());
      await this.provider.postComment(
        ref.id,
        this.blockedComment({
          title: "Fix completed locally, but PR creation is blocked",
          reason:
            "The fix, project checks, and post-fix verification completed, but GitHub write access is not configured for this workflow.",
          nextSteps: [
            "Configure the GitHub client and authenticated push URL.",
            "Push the changed branch manually from the run checkout.",
            "Re-run /fix after GitHub write access is available.",
          ],
        }),
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
        this.blockedComment({
          title: "Fix completed locally, but push failed",
          reason: push.note ?? "Unknown git push failure.",
          nextSteps: [
            "Check branch permissions and token scopes.",
            "Confirm the remote repository allows branch creation.",
            "Re-run /fix after fixing GitHub push access.",
          ],
        }),
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
    await this.provider.postComment(
      ref.id,
      "# Workflow Stopped\n\nStopped. I won't take further action on this issue until you comment `/repro` or `/fix` again.",
    );
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

  private async postReportComment(issueId: string, report: string): Promise<void> {
    const { body } = summarizeReportForComment(report, COMMENT_MAX);
    await this.provider.postComment(issueId, body);
  }

  private fixReportPath(reportPath: string): string {
    return reportPath.replace("report.md", "fix-report.md");
  }

  private verificationReportPath(reportPath: string): string {
    return reportPath.replace("report.md", "verification-report.md");
  }

  private renderFixReport(args: {
    issue: IssueContext;
    fix: FixWorkerResult;
    checks?: ProjectChecksResult;
    status: "failed" | "checks_failed" | "checks_passed";
    blockedReason?: string;
    nextSteps: string[];
  }): string {
    const { issue, fix, checks } = args;
    const status =
      args.status === "checks_passed"
        ? "Fix produced and project checks passed"
        : args.status === "checks_failed"
          ? "Fix produced but project checks failed"
          : "Fix failed";

    const filesChanged = fix.filesChanged.length
      ? fix.filesChanged.map((f) => `- \`${f}\``).join("\n")
      : "_None reported._";
    const tests = fix.testsAddedOrUpdated.length
      ? fix.testsAddedOrUpdated.map((f) => `- \`${f}\``).join("\n")
      : "_None reported._";
    const commands = fix.commandsRun.length
      ? "```\n" + fix.commandsRun.join("\n") + "\n```"
      : "_None reported._";
    const workerLogs = fix.relevantLogs.length
      ? "```\n" + redactAndTruncate(fix.relevantLogs.join("\n"), this.config.maxLogChars) + "\n```"
      : "_None reported._";
    const checkSummary = checks
      ? [
          `- Success: ${checks.success ? "yes" : "no"}`,
          `- Failed command: ${checks.failedCommand ? `\`${checks.failedCommand}\`` : "_none_"}`,
          "",
          "### Check commands",
          checks.commandsRun.length
            ? checks.commandsRun.map((c) => `- \`${c}\``).join("\n")
            : "_None._",
          "",
          "### Check logs",
          checks.logs.length
            ? "```\n" + redactAndTruncate(checks.logs.join("\n\n"), this.config.maxLogChars) + "\n```"
            : "_None._",
        ].join("\n")
      : "_Checks were not run because the fix did not complete._";

    return `# Fix Report

## Issue

- Source: ${issue.provider}
- URL: ${issue.url}
- Title: ${issue.title}
- Labels: ${issue.labels.join(", ") || "_none_"}

## Status

- Result: ${status}
- Worker used: ${fix.provider}${fix.mocked ? " _(MOCK - CLI not installed)_" : ""}
- Confidence: ${fix.confidence}/100

## Summary

${fix.summary || "_No summary provided._"}

## Files changed

${filesChanged}

## Tests added or updated

${tests}

## Commands run by worker

${commands}

## Worker logs

${workerLogs}

## Project checks

${checkSummary}

## Risks

${fix.risks.length ? fix.risks.map((r) => `- ${r}`).join("\n") : "_None reported._"}

## Blocker

${args.blockedReason ?? "_None._"}

## Recommendation

${fix.recommendation || "_None._"}

## Next steps

${args.nextSteps.map((s) => `- ${s}`).join("\n") || "_None._"}
`;
  }

  private renderVerificationReport(issue: IssueContext, result: ReproWorkerResult): string {
    const report = renderReproductionReport({
      issue,
      result,
      environment: issue.parsedBug.environment,
    }).replace("# Reproduction Report", "# Post-Fix Verification Report");

    return `${report}
## Verification judgement

- Expected after fix: reproduced = no
- Actual after fix: reproduced = ${result.reproduced ? "yes" : "no"}
- Decision: ${result.reproduced ? "do not open a PR yet" : "safe to continue to PR creation"}
`;
  }

  private blockedComment(args: {
    title: string;
    reason: string;
    nextSteps: string[];
  }): string {
    return `# Fix Blocked

## ${args.title}

**Why it stopped:** ${args.reason}

**Next steps:**
${args.nextSteps.map((s) => `- ${s}`).join("\n")}

No PR was created.`;
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

**Post-fix verification:** passed; the bug was not reproduced after the fix.

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
