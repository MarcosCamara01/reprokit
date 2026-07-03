import { describe, expect, it } from "vitest";
import {
  shouldDispatchGitHubComment,
  shouldDispatchOpenedIssue,
} from "../agent/channels/github.ts";

describe("native Eve GitHub channel dispatch", () => {
  it("wakes issue comments that contain Reprokit slash commands", () => {
    expect(
      shouldDispatchGitHubComment({
        body: "Could you /fix codex this?",
        botName: "reprokit",
        conversationKind: "issue",
      }),
    ).toBe(true);
  });

  it("does not treat PR timeline slash commands as issue commands", () => {
    expect(
      shouldDispatchGitHubComment({
        body: "/fix",
        botName: "reprokit",
        conversationKind: "pull_request",
      }),
    ).toBe(false);
  });

  it("still wakes on bot mentions for PR/review native GitHub conversations", () => {
    expect(
      shouldDispatchGitHubComment({
        body: "@reprokit please inspect this diff",
        botName: "reprokit",
        conversationKind: "review_thread",
      }),
    ).toBe(true);
  });

  it("ignores generated Reprokit comments and bot-authored comments", () => {
    expect(
      shouldDispatchGitHubComment({
        body: "# Reproduction Report\n\nComment `/fix` if approved.",
        botName: "reprokit",
        conversationKind: "issue",
      }),
    ).toBe(false);
    expect(
      shouldDispatchGitHubComment({
        author: { login: "reprokit[bot]", type: "Bot" },
        body: "/fix",
        botName: "reprokit",
        conversationKind: "issue",
      }),
    ).toBe(false);
  });

  it("wakes newly opened issues only for explicit commands or enabled automation", () => {
    expect(shouldDispatchOpenedIssue({ action: "opened", body: "/repro" })).toBe(true);
    expect(shouldDispatchOpenedIssue({ action: "edited", body: "/repro" })).toBe(false);
    expect(shouldDispatchOpenedIssue({ action: "opened", body: "plain bug report" })).toBe(false);
    expect(
      shouldDispatchOpenedIssue({
        action: "opened",
        autoFix: true,
        body: "plain bug report",
      }),
    ).toBe(true);
    expect(
      shouldDispatchOpenedIssue({
        action: "opened",
        autoFix: false,
        autoRepro: true,
        body: "plain bug report",
      }),
    ).toBe(true);
  });
});
