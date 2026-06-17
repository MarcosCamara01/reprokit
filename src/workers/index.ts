import type { CodingWorker } from "./coding-worker.js";
import type { WorkerProvider } from "../types.js";
import { CodexWorker } from "./codex-worker.js";
import { ClaudeWorker } from "./claude-worker.js";

export type { CodingWorker } from "./coding-worker.js";

/** Resolve the default worker from env (DEFAULT_WORKER), falling back to claude. */
export function defaultWorkerProvider(): WorkerProvider {
  const raw = (process.env.DEFAULT_WORKER || "claude").toLowerCase();
  return raw === "codex" ? "codex" : "claude";
}

/** Get a worker implementation by provider. */
export function getWorker(provider: WorkerProvider): CodingWorker {
  return provider === "codex" ? new CodexWorker() : new ClaudeWorker();
}
