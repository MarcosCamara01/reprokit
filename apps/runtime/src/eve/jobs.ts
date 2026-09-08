import type { LeaseJob } from "../client";
import { executeJob, type JobContext } from "../executor";
import { IMPLEMENT_TIMEOUT_MS } from "../config";
import { discoverEveJobsUrl } from "./mode";

const EVE_JOB_TIMEOUT_MS = IMPLEMENT_TIMEOUT_MS + 20 * 60_000;

/**
 * Eve jobs channel handler. The supervisor injects a JSON job payload.
 * Tools call domain gates + harness adapters + worktrees; the harness writes code.
 */
export async function runJobsChannel(job: LeaseJob, ctx: JobContext): Promise<void> {
  await ctx.client.events(job.run.id, [
    { level: "info", message: "eve jobs channel accepted payload (inline)" },
  ]);
  await executeJob(job, ctx);
}

async function postEveJob(jobsUrl: string, job: LeaseJob, ctx: JobContext): Promise<void> {
  await ctx.client.events(job.run.id, [
    { level: "info", message: `handing job to Eve at ${jobsUrl}` },
  ]);
  const response = await fetch(jobsUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(EVE_JOB_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`eve jobs channel HTTP ${response.status}`);
  }
}

export async function startEveJob(job: LeaseJob, ctx: JobContext): Promise<void> {
  const eveUrl = await discoverEveJobsUrl();
  if (eveUrl) {
    try {
      await postEveJob(eveUrl, job, ctx);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAbortError(error)) {
        await ctx.client.events(job.run.id, [
          {
            level: "warn",
            message: `Eve POST timed out; not retrying inline to avoid a double run (${message})`,
          },
        ]);
        return;
      }
      await ctx.client.events(job.run.id, [
        { level: "warn", message: `Eve not usable (${message}); falling back to inline` },
      ]);
    }
  }
  await runJobsChannel(job, ctx);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "TimeoutError") ||
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" && error instanceof DOMException)
  );
}
