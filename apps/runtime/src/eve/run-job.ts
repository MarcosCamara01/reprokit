/**
 * Child entry used when the supervisor isolates a job (`ATRIUM_EVE_SPAWN=1`).
 * Uses Eve when a jobs server is healthy; otherwise the inline channel.
 */
import { ControlPlaneClient, type LeaseJob } from "../client";
import { loadCredentials } from "../credentials";
import { startEveJob } from "./jobs";

async function main() {
  const raw = process.env.ATRIUM_JOB_JSON;
  if (!raw) throw new Error("ATRIUM_JOB_JSON is required");
  const job = JSON.parse(raw) as LeaseJob;
  const creds = loadCredentials();
  const client = new ControlPlaneClient(creds.url, creds.token);
  const available =
    job.availableHarnesses ?? [job.run.harness];
  await startEveJob(
    { ...job, availableHarnesses: available },
    { client, availableHarnesses: available },
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
