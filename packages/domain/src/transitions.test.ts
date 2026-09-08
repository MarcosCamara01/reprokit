import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  isPhaseAllowed,
  nextPhase,
  phasesForPipeline,
} from "./transitions";
import { AGENT_RUN_STATUSES } from "./catalog";

describe("status transitions", () => {
  it("allows the happy path queued → running → pr_open → done", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "pr_open")).toBe(true);
    expect(canTransition("pr_open", "done")).toBe(true);
  });

  it("forbids jumping gates", () => {
    expect(canTransition("queued", "done")).toBe(false);
    expect(canTransition("needs_info", "running")).toBe(false);
    expect(canTransition("done", "running")).toBe(false);
  });

  it("lets failed runs retry via queued", () => {
    expect(canTransition("failed", "queued")).toBe(true);
    expect(() => assertTransition("failed", "running")).toThrow(/Illegal/);
  });

  it("covers every kanban status", () => {
    for (const status of AGENT_RUN_STATUSES) {
      expect(typeof canTransition(status, "cancelled")).toBe("boolean");
    }
  });
});

describe("phases", () => {
  it("walks bug_fix diagnosing → fixing → verifying", () => {
    expect(phasesForPipeline("bug_fix")).toEqual([
      "diagnosing",
      "fixing",
      "verifying",
    ]);
    expect(nextPhase("bug_fix", null)).toBe("diagnosing");
    expect(nextPhase("bug_fix", "diagnosing")).toBe("fixing");
    expect(nextPhase("bug_fix", "fixing")).toBe("verifying");
    expect(nextPhase("bug_fix", "verifying")).toBe("verifying");
  });

  it("walks spec_implement implementing → verifying", () => {
    expect(phasesForPipeline("spec_implement")).toEqual(["implementing", "verifying"]);
    expect(isPhaseAllowed("spec_implement", "implementing", "running")).toBe(true);
    expect(isPhaseAllowed("spec_implement", "fixing", "running")).toBe(false);
  });

  it("only attaches a phase while running", () => {
    expect(isPhaseAllowed("bug_fix", "diagnosing", "running")).toBe(true);
    expect(isPhaseAllowed("bug_fix", "diagnosing", "queued")).toBe(false);
    expect(isPhaseAllowed("bug_fix", null, "queued")).toBe(true);
  });
});
