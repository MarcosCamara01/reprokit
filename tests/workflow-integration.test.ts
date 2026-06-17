import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { IssueWorkflow } from "../src/workflow/issue-workflow.ts";
import type { IssueProvider } from "../src/providers/issue-provider.ts";
import type { IssueContext } from "../src/types.ts";
import { loadRunState } from "../src/workflow/run-store.ts";
import { runPaths } from "../src/utils/paths.ts";

/** In-memory provider so we can exercise the orchestrator without GitHub. */
class FakeProvider implements IssueProvider {
  readonly id = "github" as const;
  comments: string[] = [];
  private issue: IssueContext;

  constructor(issue: IssueContext) {
    this.issue = issue;
  }

  async getIssue(): Promise<IssueContext> {
    return this.issue;
  }
  async postComment(_id: string, body: string): Promise<void> {
    this.comments.push(body);
  }
}

function issueWithSteps(number: number): IssueContext {
  return {
    provider: "github",
    id: String(number),
    number,
    url: `https://github.com/acme/widgets/issues/${number}`,
    title: "Clients disappear after clearing filters",
    body: "## Steps\n1. Open /clients\n2. Apply filter\n3. Clear filters\n## Expected\nall visible\n## Actual\nsome hidden",
    labels: ["bug"],
    comments: [],
    repository: { owner: "acme", name: "widgets", defaultBranch: "main" },
    parsedBug: {
      summary: "Clients disappear after clearing filters",
      reproductionSteps: ["Open /clients", "Apply filter", "Clear filters"],
      expectedBehavior: "all visible",
      actualBehavior: "some hidden",
    },
  };
}

function issueNoInfo(number: number): IssueContext {
  return {
    ...issueWithSteps(number),
    id: String(number),
    number,
    parsedBug: { summary: "vague", reproductionSteps: [] },
  };
}

const REPRO_ISSUE = 990001;
const GATE_ISSUE = 990002;
const NOINFO_ISSUE = 990003;

beforeAll(() => {
  process.env.WORKER_MOCK = "1"; // force mock workers (no Codex/Claude CLI needed)
});

afterAll(() => {
  delete process.env.WORKER_MOCK;
  for (const n of [REPRO_ISSUE, GATE_ISSUE, NOINFO_ISSUE]) {
    rmSync(runPaths(n).root, { recursive: true, force: true });
  }
});

describe("IssueWorkflow (mock workers, no git)", () => {
  it("/repro produces a report, posts it, and parks at WAITING_FOR_APPROVAL", async () => {
    const provider = new FakeProvider(issueWithSteps(REPRO_ISSUE));
    const wf = new IssueWorkflow({ provider, config: { defaultWorker: "claude" } });

    await wf.runRepro({ provider: "github", id: String(REPRO_ISSUE) });

    expect(provider.comments.some((c) => c.includes("Reproduction Report"))).toBe(true);
    expect(existsSync(runPaths(REPRO_ISSUE).report)).toBe(true);
    expect(loadRunState(REPRO_ISSUE)?.state).toBe("WAITING_FOR_APPROVAL");
  });

  it("/repro asks for more info when the report is too thin", async () => {
    const provider = new FakeProvider(issueNoInfo(NOINFO_ISSUE));
    const wf = new IssueWorkflow({ provider });

    await wf.runRepro({ provider: "github", id: String(NOINFO_ISSUE) });

    expect(provider.comments.some((c) => c.includes("need more information"))).toBe(true);
    expect(loadRunState(NOINFO_ISSUE)?.state).toBe("NEEDS_MORE_INFO");
  });

  it("/fix is blocked until a reproduction report exists (approval gate)", async () => {
    const provider = new FakeProvider(issueWithSteps(GATE_ISSUE));
    const wf = new IssueWorkflow({ provider });

    await wf.runFix({ provider: "github", id: String(GATE_ISSUE) });

    expect(provider.comments.some((c) => c.includes("there's no reproduction report"))).toBe(true);
  });

  it("/fix with a mock worker (no real change) ends in FIX_FAILED, no PR", async () => {
    const provider = new FakeProvider(issueWithSteps(REPRO_ISSUE));
    const wf = new IssueWorkflow({ provider, config: { defaultWorker: "claude" } });

    // REPRO_ISSUE already has a report + WAITING_FOR_APPROVAL from the first test.
    await wf.runFix({ provider: "github", id: String(REPRO_ISSUE) });

    expect(loadRunState(REPRO_ISSUE)?.state).toBe("FIX_FAILED");
    expect(provider.comments.some((c) => c.includes("did not succeed"))).toBe(true);
  });
});
