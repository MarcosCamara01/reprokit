import { describe, it, expect } from "vitest";
import { renderReproductionReport, summarizeReportForComment } from "../src/reports/reproduction-report.ts";
import type { IssueContext, ReproWorkerResult } from "../src/types.ts";

function makeIssue(): IssueContext {
  return {
    provider: "github",
    id: "42",
    number: 42,
    url: "https://github.com/acme/widgets/issues/42",
    title: "Clients disappear after clearing filters",
    body: "Some clients remain hidden until refreshing.",
    labels: ["bug", "ui"],
    comments: [],
    repository: { owner: "acme", name: "widgets", defaultBranch: "main" },
    parsedBug: {
      summary: "Clients disappear after clearing filters",
      reproductionSteps: ["Open /clients", "Apply filter", "Clear filters"],
      environment: "Chrome 120",
    },
  };
}

function makeResult(overrides: Partial<ReproWorkerResult> = {}): ReproWorkerResult {
  return {
    provider: "claude",
    reproduced: true,
    confidence: 80,
    summary: "Reproduced: clearing filters does not reset layout state.",
    reproductionSteps: ["Open /clients", "Apply filter active", "Switch to list", "Clear filters"],
    commandsRun: ["pnpm install", "pnpm test"],
    relevantLogs: ["expected 10 clients, got 6"],
    suspectedFiles: ["src/clients/Filters.tsx"],
    suspectedCause: "Stale derived state on clear.",
    recommendation: "Reset filtered list when filters are cleared.",
    ...overrides,
  };
}

describe("renderReproductionReport", () => {
  it("includes all required sections", () => {
    const md = renderReproductionReport({ issue: makeIssue(), result: makeResult() });
    for (const section of [
      "# Reproduction Report",
      "## Issue",
      "## Status",
      "## Summary",
      "## Steps to reproduce",
      "## Evidence",
      "## Suspected cause",
      "## Suspected files",
      "## Recommendation",
      "## Next action",
    ]) {
      expect(md).toContain(section);
    }
  });

  it("reflects reproduced status and confidence", () => {
    const yes = renderReproductionReport({ issue: makeIssue(), result: makeResult({ reproduced: true, confidence: 80 }) });
    expect(yes).toContain("Reproduced: ✅ yes");
    expect(yes).toContain("80/100");

    const no = renderReproductionReport({ issue: makeIssue(), result: makeResult({ reproduced: false }) });
    expect(no).toContain("Reproduced: ❌ no");
  });

  it("marks mocked worker output", () => {
    const md = renderReproductionReport({ issue: makeIssue(), result: makeResult({ mocked: true }) });
    expect(md).toContain("MOCK");
  });

  it("offers the next-action menu", () => {
    const md = renderReproductionReport({ issue: makeIssue(), result: makeResult() });
    expect(md).toContain("`/fix`");
    expect(md).toContain("`/compare`");
    expect(md).toContain("`/stop`");
  });

  it("redacts secrets that leak into worker fields", () => {
    // Fake token assembled at runtime so no token-shaped literal sits in source.
    const fakePat = "ghp_" + "a".repeat(36);
    const md = renderReproductionReport({
      issue: makeIssue(),
      result: makeResult({ summary: `leaked GITHUB_TOKEN=${fakePat}` }),
    });
    expect(md).not.toContain(fakePat);
    expect(md).toContain("[REDACTED]");
  });
});

describe("summarizeReportForComment", () => {
  it("returns the full report when under the limit", () => {
    const md = renderReproductionReport({ issue: makeIssue(), result: makeResult() });
    const { body, truncated } = summarizeReportForComment(md, 100_000);
    expect(truncated).toBe(false);
    expect(body).toBe(md);
  });

  it("trims when over the limit but keeps head + recommendation", () => {
    const md = renderReproductionReport({ issue: makeIssue(), result: makeResult() });
    const { body, truncated } = summarizeReportForComment(md, 200);
    expect(truncated).toBe(true);
    expect(body).toContain("# Reproduction Report");
    expect(body.length).toBeLessThanOrEqual(200);
  });
});
