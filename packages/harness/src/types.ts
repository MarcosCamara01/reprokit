import type { HarnessId } from "@atrium/domain";

export type HarnessJob = {
  runId: string;
  mode: "diagnose" | "implement" | "verify";
  worktree: string;
  prompt: string;
  timeoutMs: number;
  permission: "readonly" | "edits";
};

export type HarnessEvent =
  | { type: "log"; stream: "stdout" | "stderr"; chunk: string }
  | { type: "progress"; message: string }
  | { type: "result"; json: unknown }
  | { type: "hard_stop"; category: string; reason: string; needs: string }
  | { type: "exit"; code: number };

export type HarnessHealth = {
  available: boolean;
  version?: string;
  loggedIn: boolean;
};

export interface Harness {
  readonly id: HarnessId;
  health(): Promise<HarnessHealth>;
  run(job: HarnessJob): AsyncIterable<HarnessEvent>;
}

export class HarnessMissingError extends Error {
  constructor(id: HarnessId) {
    super(`machine missing harness: ${id}`);
    this.name = "HarnessMissingError";
  }
}
