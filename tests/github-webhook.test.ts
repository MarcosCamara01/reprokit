import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseWebhookEvent } from "../src/github/github-webhook.ts";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
});

beforeEach(() => {
  delete process.env.AUTO_FIX_ON_NEW_ISSUE;
  delete process.env.AUTO_REPRO_ON_NEW_ISSUE;
  delete process.env.AUTO_ISSUE_WORKER;
  delete process.env.AUTO_FIX_WORKER;
});

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

function issuePayload(body = "") {
  return {
    action: "opened",
    repository: {
      name: "widgets",
      owner: { login: "acme" },
    },
    issue: {
      number: 42,
      body,
    },
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
      commands: [{ type: "repro" }],
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

  it("ignores newly opened issues by default when they contain no command", () => {
    expect(parseWebhookEvent("issues", issuePayload("plain bug report"))).toBeNull();
  });

  it("auto-diagnoses and fixes newly opened issues when enabled", () => {
    process.env.AUTO_FIX_ON_NEW_ISSUE = "1";
    process.env.AUTO_ISSUE_WORKER = "codex";

    expect(parseWebhookEvent("issues", issuePayload("plain bug report"))).toEqual({
      ref: { provider: "github", owner: "acme", repo: "widgets", id: "42" },
      commands: [{ type: "repro" }, { type: "fix", provider: "codex" }],
      autoWorker: "codex",
    });
  });

  it("can auto-diagnose without starting a fix", () => {
    process.env.AUTO_REPRO_ON_NEW_ISSUE = "1";

    expect(parseWebhookEvent("issues", issuePayload("plain bug report"))).toEqual({
      ref: { provider: "github", owner: "acme", repo: "widgets", id: "42" },
      commands: [{ type: "repro" }],
    });
  });

  it("keeps explicit issue-body commands ahead of automatic behavior", () => {
    process.env.AUTO_FIX_ON_NEW_ISSUE = "1";

    expect(parseWebhookEvent("issues", issuePayload("/compare"))?.commands).toEqual([
      { type: "compare" },
    ]);
  });

  it("parses issue comments as a single manual command", () => {
    const payload = {
      action: "created",
      repository: { name: "widgets", owner: { login: "acme" } },
      issue: { number: 42 },
      comment: { body: "/fix claude" },
    };

    expect(parseWebhookEvent("issue_comment", payload)?.commands).toEqual([
      { type: "fix", provider: "claude" },
    ]);
  });
});
