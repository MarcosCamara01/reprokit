import { defineChannel, POST } from "eve/channels";
import { executeJob } from "../../src/executor";
import { ControlPlaneClient, type LeaseJob } from "../../src/client";
import { loadCredentials } from "../../src/credentials";

/**
 * Custom jobs channel. Production intake is the control plane; this channel
 * receives a JSON AgentRun payload from the local supervisor.
 *
 * The pipeline is deterministic (domain gates + harness adapters). The model
 * is not required to start a leased job; run_atrium_job remains for TUI/debug.
 */
export default defineChannel({
  turnPolicy: "queue",
  routes: [
    POST("/jobs", async (request) => {
      const job = (await request.json()) as LeaseJob;
      const runId = job.run?.id ?? "job";
      const creds = loadCredentials();
      const client = new ControlPlaneClient(creds.url, creds.token);
      const available = job.availableHarnesses ?? [job.run.harness];
      await executeJob(job, { client, availableHarnesses: available });
      return Response.json({ ok: true, runId });
    }),
  ],
});
