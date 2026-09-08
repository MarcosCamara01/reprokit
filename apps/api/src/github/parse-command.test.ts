import { describe, expect, it } from "vitest";
import { parseSlashCommand } from "./parse-command";

describe("parseSlashCommand", () => {
  it("parses /repro", () => {
    expect(parseSlashCommand("/repro")).toMatchObject({
      name: "repro",
      harness: "claude",
      pipeline: "bug_repro",
    });
  });

  it("parses /fix with an explicit harness", () => {
    expect(parseSlashCommand("please look\n/fix cursor\nthanks")).toMatchObject({
      name: "fix",
      harness: "cursor",
      pipeline: "bug_fix",
    });
  });

  it("parses /fix [codex] bracket form", () => {
    expect(parseSlashCommand("/fix [codex]")).toMatchObject({
      name: "fix",
      harness: "codex",
    });
  });

  it("parses /spec, /stop, /compare", () => {
    expect(parseSlashCommand("/spec")).toMatchObject({
      name: "spec",
      pipeline: "spec_implement",
    });
    expect(parseSlashCommand("/stop")).toMatchObject({
      name: "stop",
      pipeline: null,
    });
    expect(parseSlashCommand("/compare")).toMatchObject({
      name: "compare",
      pipeline: "compare",
    });
  });

  it("ignores comments without a command", () => {
    expect(parseSlashCommand("this is not a command")).toBeNull();
  });
});
