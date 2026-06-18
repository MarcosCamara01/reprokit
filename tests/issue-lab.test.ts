import { describe, expect, it } from "vitest";
import { normalizeIssueLabels, retryDelayMs } from "../src/issue-lab.ts";

describe("issue lab helpers", () => {
  it("normalizes labels for issue reports", () => {
    expect(normalizeIssueLabels([" Bug ", "bug", "", "Needs Info", "needs info "])).toEqual([
      "bug",
      "needs info",
    ]);
  });

  it("uses capped exponential retry delay", () => {
    expect(retryDelayMs(0, 250)).toBe(250);
    expect(retryDelayMs(1, 250)).toBe(500);
    expect(retryDelayMs(2, 250)).toBe(1_000);
    expect(retryDelayMs(20, 250)).toBe(5_000);
  });
});
