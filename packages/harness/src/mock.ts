import type { Harness, HarnessEvent, HarnessHealth, HarnessJob } from "./types";

/** Test-only. Production always uses getHarness() real CLI adapters. */
export class MockHarness implements Harness {
  readonly id = "claude" as const;

  async health(): Promise<HarnessHealth> {
    return { available: true, version: "mock", loggedIn: true };
  }

  async *run(job: HarnessJob): AsyncIterable<HarnessEvent> {
    yield { type: "progress", message: `mock ${job.mode} for ${job.runId}` };
    yield {
      type: "result",
      json: { mock: true, mode: job.mode, runId: job.runId },
    };
    yield { type: "exit", code: 0 };
  }
}
