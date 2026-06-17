import type { CodingWorker } from "./coding-worker.js";
import type { WorkerProvider } from "../types.js";
import { CodexWorker } from "./codex-worker.js";
import { ClaudeWorker } from "./claude-worker.js";

export type { CodingWorker } from "./coding-worker.js";

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
