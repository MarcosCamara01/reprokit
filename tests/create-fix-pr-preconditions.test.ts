import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateCreateFixPrPreconditions,
} from "../agent/tools/create_fix_pr.ts";
import { persistWorkerResult } from "../src/tool-helpers.ts";
import type {
  FixWorkerResult,
  ProjectChecksResult,
  ReproWorkerResult,
} from "../src/types.ts";
import { runPaths } from "../src/utils/paths.ts";

const ISSUE = 91001;

const fix: FixWorkerResult = {
  provider: "codex",
  model: "mock",
  effort: "test",
  fixed: true,
  confidence: 0.9,
  summary: "Fixed the failing path.",
  filesChanged: ["src/example.ts"],
  testsAddedOrUpdated: ["tests/example.test.ts"],
  commandsRun: ["npm test"],
  relevantLogs: [],
  risks: [],
  recommendation: "Open PR.",
};

const passingChecks: ProjectChecksResult = {
  success: true,
  commandsRun: ["npm test"],
  logs: ["passed"],
};

const resolvedVerification: ReproWorkerResult = {
  provider: "codex",
  model: "mock",
  effort: "test",
  reproduced: false,
  confidence: 0.86,
  summary: "Bug no longer reproduces.",
  reproductionSteps: ["Run the original repro."],
  commandsRun: ["npm test"],
  relevantLogs: [],
  suspectedFiles: [],
  recommendation: "Ship.",
};

afterEach(() => {
  rmSync(runPaths(ISSUE).root, { recursive: true, force: true });
});

describe("create_fix_pr preconditions", () => {
  it("blocks PR creation when no fix result exists", () => {
    const result = evaluateCreateFixPrPreconditions(ISSUE);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected create_fix_pr to be blocked.");
    expect(result.reason).toContain("run_fix_worker");
  });

  it("blocks PR creation when project checks failed", () => {
    persistWorkerResult(ISSUE, "last-fix.json", fix);
    persistWorkerResult(ISSUE, "last-checks.json", {
      success: false,
      commandsRun: ["npm test"],
      failedCommand: "npm test",
      logs: ["failed"],
    } satisfies ProjectChecksResult);

    const result = evaluateCreateFixPrPreconditions(ISSUE);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected create_fix_pr to be blocked.");
    expect(result.reason).toContain("npm test");
  });

  it("blocks PR creation without post-fix verification", () => {
    persistWorkerResult(ISSUE, "last-fix.json", fix);
    persistWorkerResult(ISSUE, "last-checks.json", passingChecks);

    const result = evaluateCreateFixPrPreconditions(ISSUE);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected create_fix_pr to be blocked.");
    expect(result.reason).toContain("post-fix");
  });

  it("blocks PR creation when post-fix verification still reproduces", () => {
    persistWorkerResult(ISSUE, "last-fix.json", fix);
    persistWorkerResult(ISSUE, "last-checks.json", passingChecks);
    persistWorkerResult(ISSUE, "last-post-fix-repro.json", {
      ...resolvedVerification,
      reproduced: true,
      summary: "Still failing.",
    } satisfies ReproWorkerResult);

    const result = evaluateCreateFixPrPreconditions(ISSUE);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected create_fix_pr to be blocked.");
    expect(result.reason).toContain("still reproduces");
  });

  it("allows PR creation only after fix, checks, and verification passed", () => {
    persistWorkerResult(ISSUE, "last-fix.json", fix);
    persistWorkerResult(ISSUE, "last-checks.json", passingChecks);
    persistWorkerResult(
      ISSUE,
      "last-post-fix-repro.json",
      resolvedVerification,
    );

    const result = evaluateCreateFixPrPreconditions(ISSUE);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.checks.commandsRun).toEqual(["npm test"]);
      expect(result.fix.summary).toBe("Fixed the failing path.");
      expect(result.verification.reproduced).toBe(false);
    }
  });
});
