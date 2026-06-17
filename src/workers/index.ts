import type { CodingWorker } from "./coding-worker.ts";
import type { WorkerProvider } from "../types.ts";
import { CodexWorker } from "./codex-worker.ts";
import { ClaudeWorker } from "./claude-worker.ts";

export type { CodingWorker } from "./coding-worker.ts";

/** Resolve the default worker from env (DEFAULT_WORKER). */
export function defaultWorkerProvider(): WorkerProvider {
  const raw = (process.env.DEFAULT_WORKER || "claude").toLowerCase();
  if (raw === "codex") return raw;
  return "claude";
}

/** Get a worker implementation by provider. */
export function getWorker(provider: WorkerProvider): CodingWorker {
  if (provider === "codex") return new CodexWorker();
  return new ClaudeWorker();
}
