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

  it("ignores generated missing-info prompts even when they mention commands", () => {
    expect(
      parseWebhookEvent(
        "issue_comment",
        issueCommentPayload(
          "# More Information Needed\n\nThen comment `/repro` or `/fix` again.",
        ),
      ),
    ).toBeNull();
  });

  it("ignores generated fix pipeline reports even when they mention commands", () => {
    for (const body of [
      "# Fix Report\n\n## What To Do Next\n- Comment with /fix again.",
      "# Post-Fix Verification Report\n\nReply with /fix if needed.",
      "# Fix Blocked\n\nUse /compare or /fix after updating the issue.",
      "# Fix Ready For Review\n\nComment /fix again if review finds a problem.",
      "# Workflow Stopped\n\nComment /repro when ready.",
      "# Worker Comparison Report\n\nComment /fix codex when ready.",
    ]) {
      expect(parseWebhookEvent("issue_comment", issueCommentPayload(body))).toBeNull();
    }
  });
});
