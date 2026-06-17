import type {
  CodingWorker,
} from "./coding-worker.js";
import type {
  FixWorkerInput,
  FixWorkerResult,
  ReproWorkerInput,
  ReproWorkerResult,
  WorkerProvider,
} from "../types.js";

/**
 * Deterministic mock worker used when the real CLI is not installed (or when
 * WORKER_MOCK=1). It lets the full /repro → report → /fix → PR flow run end to
 * end for demos and tests. Every result is clearly marked `mocked: true`.
 */
export class MockWorker implements CodingWorker {
  constructor(public readonly provider: WorkerProvider) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  private setupHint(): string {
    return `install the ${this.provider} CLI to get a real analysis`;
  }

  private fixSetupHint(): string {
    return `Install the ${this.provider} CLI (see README) and re-run /fix to attempt a real fix`;
  }

  async runRepro(input: ReproWorkerInput): Promise<ReproWorkerResult> {
    const { issue } = input;
    const suspected = issue.parsedBug.suspectedArea ?? "unknown";
    return {
      provider: this.provider,
      reproduced: true,
      confidence: 55,
      summary:
        `[MOCK ${this.provider}] Simulated reproduction of "${issue.title}". ` +
        `No real worker was run; ${this.setupHint()}.`,
      reproductionSteps:
        issue.parsedBug.reproductionSteps.length > 0
          ? issue.parsedBug.reproductionSteps
          : ["(mock) follow the steps described in the issue"],
      commandsRun: ["(mock) <package-manager> install", "(mock) <package-manager> test"],
      relevantLogs: ["(mock) no real logs — this is a simulated run"],
      suspectedFiles: [`src/${suspected}/* (mock guess)`],
      suspectedCause: `(mock) likely related to ${suspected}`,
      createdFiles: [],
      modifiedFiles: [],
      recommendation:
        `This is a MOCK reproduction. ${this.setupHint()} and re-run \`/repro\` for a real result.`,
      mocked: true,
    };
  }

  async runFix(input: FixWorkerInput): Promise<FixWorkerResult> {
    return {
      provider: this.provider,
      fixed: false,
      confidence: 0,
      summary:
        `[MOCK ${this.provider}] No fix was attempted because the worker is not configured.`,
      filesChanged: [],
      testsAddedOrUpdated: [],
      commandsRun: [],
      relevantLogs: [],
      risks: ["Mock worker cannot produce a real code change."],
      recommendation:
        `${this.fixSetupHint()}.`,
      mocked: true,
    };
  }
}
