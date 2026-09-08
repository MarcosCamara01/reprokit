import { hostname } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HEARTBEAT_INTERVAL_MS, LEASE_WAIT_MS, redactEventMessage } from "@atrium/domain";
import { collectCapabilities } from "@atrium/harness";
import { ControlPlaneClient, type LeaseJob } from "./client";
import { loadCredentials } from "./credentials";
import { startEveJob } from "./eve/jobs";

const here = dirname(fileURLToPath(import.meta.url));

export async function runSupervisor(opts?: { once?: boolean }): Promise<void> {
  const creds = loadCredentials();
  const client = new ControlPlaneClient(creds.url, creds.token);
  let stopping = false;

  const beat = async () => {
    const { capabilities } = await collectCapabilities();
    await client.heartbeat({
      ...capabilities,
      hostname: hostname(),
    });
    return capabilities;
  };

  await beat();
  const timer = setInterval(() => {
    beat().catch((error) => {
      console.error("heartbeat", error instanceof Error ? error.message : error);
    });
  }, HEARTBEAT_INTERVAL_MS);

  const onStop = () => {
    stopping = true;
  };
  process.on("SIGINT", onStop);
  process.on("SIGTERM", onStop);

  try {
    while (!stopping) {
      const capabilities = await beat();
      const harnesses = capabilities.harnesses;
      if (harnesses.length === 0) {
        console.error("no harness CLIs available; waiting");
        await sleep(LEASE_WAIT_MS);
        if (opts?.once) return;
        continue;
      }
      const job = await client.lease(harnesses, LEASE_WAIT_MS);
      if (!job) {
        if (opts?.once) return;
        continue;
      }
      await runLeasedJob(job, client, harnesses);
      if (opts?.once) return;
    }
  } finally {
    clearInterval(timer);
  }
}

async function runLeasedJob(
  job: LeaseJob,
  client: ControlPlaneClient,
  availableHarnesses: Array<"claude" | "codex" | "cursor">,
) {
  try {
    const eveMode = process.env.ATRIUM_EVE_SPAWN === "1";
    if (eveMode) {
      await spawnEveProcess(job, availableHarnesses);
      return;
    }
      await startEveJob(
        { ...job, availableHarnesses },
        { client, availableHarnesses },
      );
  } catch (error) {
    const message = redactEventMessage(error instanceof Error ? error.message : String(error));
    await client.complete({
      runId: job.run.id,
      status: "failed",
      errorSummary: message,
    });
  }
}

function spawnEveProcess(
  job: LeaseJob,
  availableHarnesses: Array<"claude" | "codex" | "cursor">,
): Promise<void> {
  const script = join(here, "eve/run-job.ts");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script], {
      env: {
        ...process.env,
        ATRIUM_JOB_JSON: JSON.stringify({ ...job, availableHarnesses }),
      },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`eve job process exited ${code ?? "null"}`));
    });
    child.on("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
