import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync } from "node:fs";
import { IssueWorkflow } from "../src/workflow/issue-workflow.ts";
import type { IssueProvider } from "../src/providers/issue-provider.ts";
import type { IssueContext } from "../src/types.ts";
import { loadRunState } from "../src/workflow/run-store.ts";
import { runPaths } from "../src/utils/paths.ts";
import { coerceHardStop } from "../src/workers/coding-worker.ts";

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

const FIX_HARDSTOP_ISSUE = 990101;
const REPRO_HARDSTOP_ISSUE = 990102;

beforeAll(() => {
  process.env.WORKER_MOCK = "1"; // force mock workers (no Codex/Claude CLI needed)
});

afterAll(() => {
  delete process.env.WORKER_MOCK;
  delete process.env.WORKER_MOCK_HARDSTOP;
  for (const n of [FIX_HARDSTOP_ISSUE, REPRO_HARDSTOP_ISSUE]) {
    rmSync(runPaths(n).root, { recursive: true, force: true });
  }
});

describe("IssueWorkflow hard stops (mock workers, no git)", () => {
  it("/fix posts a 'Human Decision Needed' comment and parks at NEEDS_HUMAN_DECISION when the fix worker hard-stops", async () => {
    process.env.WORKER_MOCK_HARDSTOP = "fix";
    try {
      const provider = new FakeProvider(issueWithSteps(FIX_HARDSTOP_ISSUE));
      const wf = new IssueWorkflow({ provider, config: { defaultWorker: "claude" } });

      await wf.runFix({ provider: "github", id: String(FIX_HARDSTOP_ISSUE) });

      expect(provider.comments.some((c) => c.includes("Human Decision Needed"))).toBe(true);
      expect(provider.comments.some((c) => c.includes("Hard-stop category"))).toBe(true);
      expect(provider.comments.some((c) => c.includes("ambiguous-requirements"))).toBe(true);
      // It must NOT fall through to the generic fix-failure report or open a PR.
      expect(provider.comments.some((c) => c.includes("# Fix Report"))).toBe(false);
      expect(provider.comments.some((c) => c.includes("Fix Ready For Review"))).toBe(false);
      expect(loadRunState(FIX_HARDSTOP_ISSUE)?.state).toBe("NEEDS_HUMAN_DECISION");
    } finally {
      delete process.env.WORKER_MOCK_HARDSTOP;
    }
  });

  it("/repro posts a 'Human Decision Needed' comment instead of a reproduction report when the repro worker hard-stops", async () => {
    process.env.WORKER_MOCK_HARDSTOP = "repro";
    try {
      const provider = new FakeProvider(issueWithSteps(REPRO_HARDSTOP_ISSUE));
      const wf = new IssueWorkflow({ provider, config: { defaultWorker: "claude" } });

      await wf.runRepro({ provider: "github", id: String(REPRO_HARDSTOP_ISSUE) });

      expect(provider.comments.some((c) => c.includes("Human Decision Needed"))).toBe(true);
      expect(provider.comments.some((c) => c.includes("Reproduction Report"))).toBe(false);
      expect(loadRunState(REPRO_HARDSTOP_ISSUE)?.state).toBe("NEEDS_HUMAN_DECISION");
    } finally {
      delete process.env.WORKER_MOCK_HARDSTOP;
    }
  });
});

describe("coerceHardStop", () => {
  it("returns null for missing, empty, or contentless input", () => {
    expect(coerceHardStop(null)).toBeNull();
    expect(coerceHardStop(undefined)).toBeNull();
    expect(coerceHardStop("nope")).toBeNull();
    expect(coerceHardStop({})).toBeNull();
    expect(coerceHardStop({ category: "auth" })).toBeNull(); // no reason/needs
  });

  it("keeps a valid hard stop and normalizes an unknown category to 'other'", () => {
    const hs = coerceHardStop({
      category: "made-up",
      reason: "Needs a new dependency",
      needs: "Approve adding left-pad",
    });
    expect(hs).toEqual({
      category: "other",
      reason: "Needs a new dependency",
      needs: "Approve adding left-pad",
    });
  });

  it("preserves a known category and fills sensible defaults for a partial blob", () => {
    expect(coerceHardStop({ category: "payments", reason: "Touches billing" })).toEqual({
      category: "payments",
      reason: "Touches billing",
      needs: "Review the issue and decide how to proceed, then re-run the command.",
    });
  });
});
