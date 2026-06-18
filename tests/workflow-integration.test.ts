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
const FIX_PIPELINE_ISSUE = 990002;
const NOINFO_ISSUE = 990003;
const NOINFO_FIX_ISSUE = 990004;

beforeAll(() => {
  process.env.WORKER_MOCK = "1"; // force mock workers (no Codex/Claude CLI needed)
});

afterAll(() => {
  delete process.env.WORKER_MOCK;
  for (const n of [REPRO_ISSUE, FIX_PIPELINE_ISSUE, NOINFO_ISSUE, NOINFO_FIX_ISSUE]) {
    rmSync(runPaths(n).root, { recursive: true, force: true });
  }
});

describe("IssueWorkflow (mock workers, no git)", () => {
  it("/repro produces a report, posts it, and parks at WAITING_FOR_APPROVAL", async () => {
    const provider = new FakeProvider(issueWithSteps(REPRO_ISSUE));
    const wf = new IssueWorkflow({ provider, config: { defaultWorker: "claude" } });

    await wf.runRepro({ provider: "github", id: String(REPRO_ISSUE) });

    expect(provider.comments.some((c) => c.includes("Reproduction Report"))).toBe(true);
    expect(provider.comments.some((c) => c.includes("## What I Tried"))).toBe(true);
    expect(provider.comments.some((c) => c.includes("## What To Do Next"))).toBe(true);
    expect(existsSync(runPaths(REPRO_ISSUE).report)).toBe(true);
    expect(loadRunState(REPRO_ISSUE)?.state).toBe("WAITING_FOR_APPROVAL");
  });

  it("/repro asks for more info when the report is too thin", async () => {
    const provider = new FakeProvider(issueNoInfo(NOINFO_ISSUE));
    const wf = new IssueWorkflow({ provider });

    await wf.runRepro({ provider: "github", id: String(NOINFO_ISSUE) });

    expect(provider.comments.some((c) => c.includes("More Information Needed"))).toBe(true);
    expect(provider.comments.some((c) => c.includes("## Why It Blocked"))).toBe(true);
    expect(loadRunState(NOINFO_ISSUE)?.state).toBe("NEEDS_MORE_INFO");
  });

  it("/fix asks for more info before starting the full pipeline when issue details are too thin", async () => {
    const provider = new FakeProvider(issueNoInfo(NOINFO_FIX_ISSUE));
    const wf = new IssueWorkflow({ provider });

    await wf.runFix({ provider: "github", id: String(NOINFO_FIX_ISSUE) });

    expect(provider.comments.some((c) => c.includes("More Information Needed"))).toBe(true);
    expect(loadRunState(NOINFO_FIX_ISSUE)?.state).toBe("NEEDS_MORE_INFO");
  });

  it("/fix runs reproduction first, then reports fix failure when the worker cannot change code", async () => {
    const provider = new FakeProvider(issueWithSteps(FIX_PIPELINE_ISSUE));
    const wf = new IssueWorkflow({ provider, config: { defaultWorker: "claude" } });

    await wf.runFix({ provider: "github", id: String(FIX_PIPELINE_ISSUE) });

    expect(provider.comments.some((c) => c.includes("Reproduction Report"))).toBe(true);
    expect(provider.comments.some((c) => c.includes("Fix Report"))).toBe(true);
    expect(provider.comments.some((c) => c.includes("## What Changed"))).toBe(true);
    expect(provider.comments.some((c) => c.includes("## Checks Passed"))).toBe(true);
    expect(existsSync(runPaths(FIX_PIPELINE_ISSUE).report)).toBe(true);
    expect(loadRunState(FIX_PIPELINE_ISSUE)?.state).toBe("FIX_FAILED");
  });
});
