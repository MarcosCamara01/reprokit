import type {
  CodingWorker,
} from "./coding-worker.ts";
import type {
  FixWorkerInput,
  FixWorkerResult,
  HardStop,
  ReproWorkerInput,
  ReproWorkerResult,
  WorkerProvider,
} from "../types.ts";
import { mockMetadata } from "./metadata.ts";

/**
 * Deterministic mock worker used when the real CLI is not installed (or when
 * WORKER_MOCK=1). It lets the full /repro → report → /fix → PR flow run end to
 * end for demos and tests. Every result is clearly marked `mocked: true`.
 */
export class MockWorker implements CodingWorker {
  readonly provider: WorkerProvider;
  private readonly metadata = mockMetadata();

  constructor(provider: WorkerProvider) {
    this.provider = provider;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  private setupHint(): string {
    return `install the ${this.provider} CLI to get a real analysis`;
  }

  private fixSetupHint(): string {
    return `Install the ${this.provider} CLI (see README) and re-run /fix to attempt a real fix`;
  }

  /**
   * `WORKER_MOCK_HARDSTOP` opts the mock into a deterministic hard stop so the
   * full "needs human decision" path can be exercised end to end. Accepts
   * `repro`, `fix`, or `1`/`both` (both phases).
   */
  private hardStopFor(phase: "repro" | "fix"): HardStop | null {
    const mode = (process.env.WORKER_MOCK_HARDSTOP || "").trim().toLowerCase();
    if (!mode) return null;
    const active = mode === phase || mode === "1" || mode === "true" || mode === "both";
    if (!active) return null;
    return {
      category: "ambiguous-requirements",
      reason: `[MOCK ${this.provider}] Simulated hard stop during ${phase}: the request is ambiguous.`,
      needs: "(mock) Clarify the intended behavior, then re-run the command.",
    };
  }

  async runRepro(input: ReproWorkerInput): Promise<ReproWorkerResult> {
    const { issue } = input;
    const suspected = issue.parsedBug.suspectedArea ?? "unknown";
    const hardStop = this.hardStopFor("repro");
    if (hardStop) {
      return {
        provider: this.provider,
        ...this.metadata,
        reproduced: false,
        confidence: 0,
        summary: hardStop.reason,
        reproductionSteps: [],
        commandsRun: [],
        relevantLogs: [],
        suspectedFiles: [],
        createdFiles: [],
        modifiedFiles: [],
        recommendation: hardStop.needs,
        mocked: true,
        hardStop,
      };
    }
    return {
      provider: this.provider,
      ...this.metadata,
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

  async runFix(_input: FixWorkerInput): Promise<FixWorkerResult> {
    const hardStop = this.hardStopFor("fix");
    if (hardStop) {
      return {
        provider: this.provider,
        ...this.metadata,
        fixed: false,
        confidence: 0,
        summary: hardStop.reason,
        filesChanged: [],
        testsAddedOrUpdated: [],
        commandsRun: [],
        relevantLogs: [],
        risks: [],
        recommendation: hardStop.needs,
        mocked: true,
        hardStop,
      };
    }
    return {
      provider: this.provider,
      ...this.metadata,
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
