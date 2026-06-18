import { describe, it, expect } from "vitest";
import { parseIssueCommand, hasIssueCommand } from "../src/utils/command-parser.ts";

describe("parseIssueCommand", () => {
  it("parses /repro", () => {
    expect(parseIssueCommand("/repro")).toEqual({ type: "repro" });
  });

  it("parses /repro codex", () => {
    expect(parseIssueCommand("/repro codex")).toEqual({ type: "repro", provider: "codex" });
  });

  it("parses /repro claude", () => {
    expect(parseIssueCommand("/repro claude")).toEqual({ type: "repro", provider: "claude" });
  });

  it("parses /fix with no worker", () => {
    expect(parseIssueCommand("/fix")).toEqual({ type: "fix" });
  });

  it("parses /fix codex", () => {
    expect(parseIssueCommand("/fix codex")).toEqual({ type: "fix", provider: "codex" });
  });

  it("parses /fix claude", () => {
    expect(parseIssueCommand("/fix claude")).toEqual({ type: "fix", provider: "claude" });
  });

  it("parses /compare", () => {
    expect(parseIssueCommand("/compare")).toEqual({ type: "compare" });
  });

  it("parses /stop", () => {
    expect(parseIssueCommand("/stop")).toEqual({ type: "stop" });
  });

  it("is case-insensitive and tolerates whitespace", () => {
    expect(parseIssueCommand("   /Fix   CODEX  ")).toEqual({ type: "fix", provider: "codex" });
    expect(parseIssueCommand("/REPRO CODEX")).toEqual({ type: "repro", provider: "codex" });
  });

  it("finds a command inside surrounding prose / multiline", () => {
    expect(parseIssueCommand("hey team, please /repro this when you can")).toEqual({
      type: "repro",
    });
    expect(parseIssueCommand("ok, please run `/repro` when ready")).toEqual({
      type: "repro",
    });
    expect(parseIssueCommand("ship it with /fix codex please")).toEqual({
      type: "fix",
      provider: "codex",
    });
    expect(parseIssueCommand("thanks!\n\n/fix claude\n\n-- me")).toEqual({
      type: "fix",
      provider: "claude",
    });
  });

  it("ignores an unknown worker arg for /fix", () => {
    expect(parseIssueCommand("/fix banana")).toEqual({ type: "fix" });
  });

  it("ignores an unknown worker arg for /repro", () => {
    expect(parseIssueCommand("/repro banana")).toEqual({ type: "repro" });
  });

  it("returns unknown for non-commands", () => {
    expect(parseIssueCommand("hello world")).toEqual({ type: "unknown", raw: "hello world" });
    expect(parseIssueCommand("")).toEqual({ type: "unknown", raw: "" });
  });

  it("hasIssueCommand reflects parse result", () => {
    expect(hasIssueCommand("/repro")).toBe(true);
    expect(hasIssueCommand("just a comment")).toBe(false);
  });
});
