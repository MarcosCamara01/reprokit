import { defineTool } from "eve/tools";
import { z } from "zod";
import { executeJob } from "../../src/executor";
import { ControlPlaneClient, type LeaseJob } from "../../src/client";
import { loadCredentials } from "../../src/credentials";

export default defineTool({
  description:
    "Execute the deterministic Atrium pipeline for a leased job (gates, harness, worktree, PR).",
  inputSchema: z.object({
    job: z.unknown(),
  }),
  async execute({ job }) {
    const creds = loadCredentials();
    const client = new ControlPlaneClient(creds.url, creds.token);
    const payload = job as LeaseJob;
    const available = payload.availableHarnesses ?? [payload.run.harness];
    await executeJob(payload, {
      client,
      availableHarnesses: available,
    });
    return { ok: true, runId: payload.run.id };
  },
});
