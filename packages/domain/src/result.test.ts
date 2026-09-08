import { describe, expect, it } from "vitest";
import { parseHarnessStepResult } from "./result";

describe("parseHarnessStepResult", () => {
  it("reads the last JSON object from mixed CLI output", () => {
    const text = [
      "thinking...",
      '{"noise": true}',
      '{"reproduced": true, "summary": "500 on /pay", "needs_info": null, "hard_stop": null}',
    ].join("\n");
    expect(parseHarnessStepResult(text)).toMatchObject({
      reproduced: true,
      summary: "500 on /pay",
    });
  });

  it("parses hard_stop payloads", () => {
    const text = JSON.stringify({
      reproduced: false,
      summary: "blocked",
      hard_stop: { category: "auth", reason: "login wall", needs: "credentials" },
    });
    expect(parseHarnessStepResult(text)?.hardStop).toEqual({
      category: "auth",
      reason: "login wall",
      needs: "credentials",
    });
  });

  it("parses spec criteria_met", () => {
    expect(
      parseHarnessStepResult(
        JSON.stringify({ criteria_met: true, summary: "matches spec" }),
      ),
    ).toMatchObject({ criteriaMet: true, summary: "matches spec" });
  });
});
