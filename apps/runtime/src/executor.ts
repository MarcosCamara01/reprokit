import {
  diagnosePrompt,
  evaluateIntake,
  implementPrompt,
  missingHarnessMessage,
  parseHarnessStepResult,
  pickSpecCopy,
  redactEventMessage,
  specImplementPrompt,
  specVerifyPrompt,
  verifyPrompt,
  type HarnessId,
  type PipelineFacts,
  emptyFacts,
  nextPipelineCommand,
} from "@atrium/domain";
import { getHarness, type HarnessEvent } from "@atrium/harness";
import { runProjectChecks } from "./checks";
import type { ControlPlaneClient, LeaseJob } from "./client";
import { DIAGNOSE_TIMEOUT_MS, IMPLEMENT_TIMEOUT_MS, resolveAtriumHome } from "./config";
import {
  changedPaths,
  collectDiffStat,
  commitIfDirty,
  hasCommitsAhead,
  isSpecOnlyDiff,
  prepareWorktree,
  pushBranch,
  writeSpecCopy,
} from "./git";

export type JobContext = {
  client: ControlPlaneClient;
  availableHarnesses: HarnessId[];
};

async function log(
  ctx: JobContext,
  runId: string,
  message: string,
  stream = "stdout",
  level = "info",
) {
  const event = { stream, level, message: redactEventMessage(message) };
  await ctx.client.events(runId, [event]);
}

async function runHarnessStep(input: {
  harness: HarnessId;
  worktree: string;
  runId: string;
  mode: "diagnose" | "implement" | "verify";
  prompt: string;
  permission: "readonly" | "edits";
  ctx: JobContext;
}): Promise<{ text: string; exitCode: number; hardStop?: { category: string; reason: string; needs: string } }> {
  const adapter = getHarness(input.harness);
  const health = await adapter.health();
  if (!health.available) {
    throw new Error(missingHarnessMessage(input.harness));
  }

  const timeoutMs = input.mode === "implement" ? IMPLEMENT_TIMEOUT_MS : DIAGNOSE_TIMEOUT_MS;
  let text = "";
  let exitCode = 1;
  let hardStop: { category: string; reason: string; needs: string } | undefined;
  const batch: Array<{ stream?: string; level?: string; message: string }> = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const events = batch.splice(0, batch.length);
    await input.ctx.client.events(input.runId, events);
  };

  for await (const event of adapter.run({
    runId: input.runId,
    mode: input.mode,
    worktree: input.worktree,
    prompt: input.prompt,
    timeoutMs,
    permission: input.permission,
  })) {
    await handleHarnessEvent(event, {
      text: (chunk) => {
        text += chunk;
      },
      exit: (code) => {
        exitCode = code;
      },
      hardStop: (stop) => {
        hardStop = stop;
      },
      enqueue: (item) => batch.push(item),
    });
    if (batch.length >= 12) await flush();
  }
  await flush();
  return { text, exitCode, hardStop };
}

function handleHarnessEvent(
  event: HarnessEvent,
  sink: {
    text: (chunk: string) => void;
    exit: (code: number) => void;
    hardStop: (stop: { category: string; reason: string; needs: string }) => void;
    enqueue: (item: { stream?: string; level?: string; message: string }) => void;
  },
) {
  switch (event.type) {
    case "log":
      sink.text(event.chunk);
      sink.enqueue({ stream: event.stream, message: event.chunk });
      break;
    case "progress":
      sink.text(`${event.message}\n`);
      sink.enqueue({ level: "info", message: event.message });
      break;
    case "result":
      sink.text(`${JSON.stringify(event.json)}\n`);
      sink.enqueue({ level: "info", message: JSON.stringify(event.json) });
      break;
    case "hard_stop":
      sink.hardStop({ category: event.category, reason: event.reason, needs: event.needs });
      sink.enqueue({ level: "warn", message: `hard_stop: ${event.reason}` });
      break;
    case "exit":
      sink.exit(event.code);
      break;
  }
}

export async function executeJob(job: LeaseJob, ctx: JobContext): Promise<void> {
  const runId = job.run.id;
  const ticket = job.ticket;
  if (!ticket) {
    await ctx.client.complete({
      runId,
      status: "needs_info",
      errorSummary: "Run has no ticket snapshot.",
      questions: ["Bind this run to a GitHub issue with a body."],
    });
    return;
  }

  const intake = evaluateIntake({ title: ticket.title, body: ticket.body });
  const specCopy =
    job.run.pipeline === "spec_implement"
      ? pickSpecCopy({ identifier: ticket.identifier, artifacts: job.artifacts ?? [] })
      : null;
  let facts: PipelineFacts = {
    ...emptyFacts(job.run.pipeline),
    intakeOk: job.run.pipeline === "spec_implement" ? Boolean(specCopy) : intake.ok,
    pauseAfterRepro: Boolean(job.run.policySnapshot.pauseAfterRepro),
    compareHarnesses:
      job.run.pipeline === "compare"
        ? pickCompareHarnesses(job.run.harness, ctx.availableHarnesses)
        : [],
  };

  if (job.run.pipeline === "spec_implement" && !specCopy) {
    await ctx.client.complete({
      runId,
      status: "needs_info",
      errorSummary: "spec_implement is missing the approved spec artifact.",
      questions: ["Approve the spec and queue implement so the spec copy is attached to the run."],
    });
    return;
  }

  if (job.run.pipeline === "compare" && facts.compareHarnesses.length < 2) {
    await ctx.client.complete({
      runId,
      status: "failed",
      errorSummary: "compare requires at least two available harnesses on this machine.",
    });
    return;
  }

  const home = resolveAtriumHome();
  const worktrees = new Map<string, { worktree: string; branch: string }>();
  let lastSummary = specCopy?.markdown ?? "";
  let prUrl: string | null = null;
  let branch: string | null = null;

  const ensureWorktree = async (harness: HarnessId, suffix?: string) => {
    const key = suffix ?? harness;
    const existing = worktrees.get(key);
    if (existing) return existing;
    if (!job.repo) {
      throw new Error("No GitHub repository is bound for this ticket.");
    }
    const creds = await ctx.client.gitCredentials(runId);
    const prepared = await prepareWorktree({
      home,
      runId,
      owner: job.repo.owner,
      repo: job.repo.repo,
      cloneUrl: creds.cloneUrl,
      defaultBranch: job.repo.defaultBranch,
      pipeline: job.run.pipeline,
      identifier: ticket.identifier,
      token: creds.token,
      suffix,
    });
    worktrees.set(key, prepared);
    await log(ctx, runId, `worktree ready at ${prepared.worktree} (${prepared.branch})`);
    return prepared;
  };

  while (true) {
    const command = nextPipelineCommand(facts);
    switch (command.type) {
      case "needs_info":
        await ctx.client.complete({
          runId,
          status: "needs_info",
          errorSummary: command.questions.join(" "),
          questions: command.questions,
        });
        return;
      case "hard_stop":
        await ctx.client.complete({
          runId,
          status: "needs_info",
          errorSummary: `${command.stop.category}: ${command.stop.reason}`,
          questions: [command.stop.needs],
        });
        return;
      case "write_spec": {
        if (!specCopy) {
          facts = {
            ...facts,
            needsInfo: ["Approved spec markdown is missing from the run artifacts."],
          };
          break;
        }
        await ctx.client.progress(runId, command.phase);
        const prepared = await ensureWorktree(job.run.harness);
        const written = writeSpecCopy(prepared.worktree, specCopy.path, specCopy.markdown);
        await commitIfDirty(prepared.worktree, `docs: add spec copy for ${ticket.identifier}`);
        lastSummary = specCopy.markdown;
        facts = { ...facts, specCopied: true };
        await log(ctx, runId, `wrote ${written} onto ${prepared.branch}`);
        break;
      }
      case "diagnose": {
        const harness = command.harness ?? job.run.harness;
        await ctx.client.progress(runId, command.phase);
        const prepared = await ensureWorktree(
          harness,
          job.run.pipeline === "compare" ? harness : undefined,
        );
        const result = await runHarnessStep({
          harness,
          worktree: prepared.worktree,
          runId,
          mode: "diagnose",
          prompt: diagnosePrompt(ticket),
          permission: "readonly",
          ctx,
        });
        const parsed = parseHarnessStepResult(result.text);
        if (result.hardStop || parsed?.hardStop) {
          facts = { ...facts, hardStop: result.hardStop ?? parsed?.hardStop };
          break;
        }
        if (parsed?.needsInfo && parsed.needsInfo.length > 0) {
          facts = { ...facts, needsInfo: parsed.needsInfo };
          break;
        }
        const reproduced = parsed?.reproduced ?? false;
        lastSummary = parsed?.summary ?? result.text.slice(-2_000);
        facts = {
          ...facts,
          diagnosed: job.run.pipeline !== "compare",
          reproducedBeforeFix: reproduced,
          compareReports:
            job.run.pipeline === "compare"
              ? { ...facts.compareReports, [harness]: lastSummary }
              : facts.compareReports,
        };
        await ctx.client.artifact({
          runId,
          kind: "repro_report",
          excerpt: lastSummary,
          metadata: { harness, reproduced, worktree: prepared.worktree },
        });
        break;
      }
      case "implement": {
        await ctx.client.progress(runId, command.phase);
        const prepared = await ensureWorktree(job.run.harness);
        const prompt =
          job.run.pipeline === "spec_implement" && specCopy
            ? specImplementPrompt(ticket, specCopy.markdown, specCopy.path)
            : implementPrompt(ticket, lastSummary);
        const result = await runHarnessStep({
          harness: job.run.harness,
          worktree: prepared.worktree,
          runId,
          mode: "implement",
          prompt,
          permission: "edits",
          ctx,
        });
        const parsed = parseHarnessStepResult(result.text);
        if (result.hardStop || parsed?.hardStop) {
          facts = { ...facts, hardStop: result.hardStop ?? parsed?.hardStop };
          break;
        }
        await commitIfDirty(
          prepared.worktree,
          job.run.pipeline === "spec_implement"
            ? `feat: implement ${ticket.identifier} ${runId.slice(0, 8)}`
            : `fix: atrium ${ticket.identifier} ${runId.slice(0, 8)}`,
        );
        lastSummary = parsed?.summary ?? lastSummary;
        facts = { ...facts, implemented: true };
        await ctx.client.artifact({
          runId,
          kind: "fix_report",
          excerpt: lastSummary,
          metadata: { worktree: prepared.worktree },
        });
        break;
      }
      case "checks": {
        await ctx.client.progress(runId, command.phase);
        const prepared = await ensureWorktree(job.run.harness);
        const checks = await runProjectChecks(prepared.worktree);
        await log(ctx, runId, checks.excerpt, "stdout", checks.ok ? "info" : "error");
        facts = { ...facts, checksPassed: checks.ok };
        await ctx.client.artifact({
          runId,
          kind: "checks",
          excerpt: checks.excerpt,
        });
        break;
      }
      case "verify": {
        await ctx.client.progress(runId, command.phase);
        const prepared = await ensureWorktree(job.run.harness);
        const prompt =
          job.run.pipeline === "spec_implement" && specCopy
            ? specVerifyPrompt(ticket, specCopy.markdown, specCopy.path)
            : verifyPrompt(ticket, lastSummary);
        const result = await runHarnessStep({
          harness: job.run.harness,
          worktree: prepared.worktree,
          runId,
          mode: "verify",
          prompt,
          permission: "readonly",
          ctx,
        });
        const parsed = parseHarnessStepResult(result.text);
        if (result.hardStop || parsed?.hardStop) {
          facts = { ...facts, hardStop: result.hardStop ?? parsed?.hardStop };
          break;
        }
        if (job.run.pipeline === "spec_implement") {
          facts = {
            ...facts,
            verified: true,
            specCriteriaMet: parsed?.criteriaMet ?? result.exitCode === 0,
          };
          break;
        }
        facts = {
          ...facts,
          verified: true,
          reproducedAfterFix: parsed?.reproduced ?? true,
        };
        break;
      }
      case "open_pr": {
        if (!job.repo) {
          await ctx.client.complete({
            runId,
            status: "failed",
            errorSummary: "Cannot open a PR without a GitHub repo binding.",
          });
          return;
        }
        const prepared = await ensureWorktree(job.run.harness);
        branch = prepared.branch;
        if (!(await hasCommitsAhead(prepared.worktree, job.repo.defaultBranch))) {
          await ctx.client.complete({
            runId,
            status: "failed",
            errorSummary: "Harness produced no commits; no PR.",
            branchName: branch,
          });
          return;
        }
        if (job.run.pipeline === "spec_implement") {
          const paths = await changedPaths(prepared.worktree, job.repo.defaultBranch);
          if (isSpecOnlyDiff(paths)) {
            await ctx.client.complete({
              runId,
              status: "failed",
              errorSummary: "Harness produced no implementation commits; no PR.",
              branchName: branch,
            });
            return;
          }
        }
        const creds = await ctx.client.gitCredentials(runId);
        await pushBranch({
          worktree: prepared.worktree,
          branch: prepared.branch,
          token: creds.token,
          cloneUrl: creds.cloneUrl,
        });
        const stat = await collectDiffStat(prepared.worktree, job.repo.defaultBranch);
        if (stat) {
          await ctx.client.artifact({ runId, kind: "diff_stat", excerpt: stat });
        }
        const opened = await ctx.client.openPr({
          runId,
          branch: prepared.branch,
          title: `${ticket.identifier} ${ticket.title}`.slice(0, 70),
          body: lastSummary || `Fix for ${ticket.identifier}`,
        });
        prUrl = opened.pr.url;
        facts = { ...facts, prOpened: true };
        break;
      }
      case "finish":
        await ctx.client.complete({
          runId,
          status: command.status,
          errorSummary: command.reason ?? null,
          prUrl,
          branchName: branch,
        });
        return;
    }
  }
}

function pickCompareHarnesses(preferred: HarnessId, available: HarnessId[]): HarnessId[] {
  const ordered: HarnessId[] = [preferred, "claude", "codex", "cursor"];
  const picked: HarnessId[] = [];
  for (const id of ordered) {
    if (available.includes(id) && !picked.includes(id)) picked.push(id);
    if (picked.length === 3) break;
  }
  return picked;
}
