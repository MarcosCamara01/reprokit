import { describe, expect, it } from "vitest";
import { parseWebhookEvent } from "../src/github/github-webhook.ts";

function issueCommentPayload(body: string) {
  return {
    action: "created",
    repository: {
      name: "reprokit",
      owner: { login: "MarcosCamara01" },
    },
    issue: { number: 3 },
    comment: { body },
  };
}

describe("parseWebhookEvent", () => {
  it("parses human issue comments with commands in prose", () => {
    expect(
      parseWebhookEvent(
        "issue_comment",
        issueCommentPayload("hey team, please /repro this when you can"),
      ),
    ).toEqual({
      ref: {
        provider: "github",
        owner: "MarcosCamara01",
        repo: "reprokit",
        id: "3",
      },
      command: { type: "repro" },
    });
  });

  it("ignores generated reproduction reports even when they mention commands", () => {
    expect(
      parseWebhookEvent(
        "issue_comment",
        issueCommentPayload("# Reproduction Report\n\nOriginal issue body:\n/repro"),
      ),
    ).toBeNull();
  });
});
