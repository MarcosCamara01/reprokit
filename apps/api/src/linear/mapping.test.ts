import { describe, expect, it } from "vitest";
import {
  extractAgentSessionId,
  extractCommentBody,
  extractCommentIssueId,
  extractIssueFromWebhook,
  isAgentSessionEvent,
  isAgentStopSignal,
  isHumanLinearActor,
  linearIssueBindingKeys,
  mapLinearIssueToTicket,
  type LinearWebhookPayload,
} from "./mapping";

const issue: LinearWebhookPayload = {
  action: "create",
  type: "Issue",
  organizationId: "org-lin",
  url: "https://linear.app/acme/issue/ENG-12",
  data: {
    id: "issue-uuid",
    identifier: "ENG-12",
    title: "Checkout 500",
    description: "Steps to reproduce on /pay. Expected 200, actual 500.",
    url: "https://linear.app/acme/issue/ENG-12",
    teamId: "team-eng",
    projectId: "proj-checkout",
    labels: [{ name: "bug" }],
  },
};

describe("Linear webhook mapping", () => {
  it("maps an Issue payload to a ticket + binding keys", () => {
    const extracted = extractIssueFromWebhook(issue);
    expect(extracted?.identifier).toBe("ENG-12");
    expect(linearIssueBindingKeys(extracted!)).toEqual({
      teamId: "team-eng",
      projectId: "proj-checkout",
    });
    expect(mapLinearIssueToTicket({ issue: extracted! })).toMatchObject({
      externalId: "issue-uuid",
      identifier: "ENG-12",
      labels: ["bug"],
    });
  });

  it("falls back to team-only binding keys when project is missing", () => {
    expect(
      linearIssueBindingKeys({
        id: "x",
        team: { id: "team-eng" },
      }),
    ).toEqual({ teamId: "team-eng", projectId: null });
  });

  it("extracts slash-command comments", () => {
    const payload: LinearWebhookPayload = {
      type: "Comment",
      action: "create",
      actor: { type: "user" },
      data: { body: "/fix cursor", issueId: "issue-uuid" },
    };
    expect(extractCommentBody(payload)).toBe("/fix cursor");
    expect(extractCommentIssueId(payload)).toBe("issue-uuid");
    expect(isHumanLinearActor(payload.actor)).toBe(true);
  });

  it("maps Agent Session created/prompted payloads", () => {
    const created: LinearWebhookPayload = {
      type: "AgentSessionEvent",
      action: "created",
      organizationId: "org-lin",
      agentSession: {
        id: "session-1",
        issue: {
          id: "issue-uuid",
          identifier: "ENG-12",
          title: "Checkout 500",
          description: "Broken on /pay",
          teamId: "team-eng",
        },
      },
      promptContext: "<issue identifier=\"ENG-12\" />",
    };
    expect(isAgentSessionEvent("AgentSessionEvent", created)).toBe(true);
    expect(extractAgentSessionId(created)).toBe("session-1");
    expect(extractIssueFromWebhook(created)?.identifier).toBe("ENG-12");

    const prompted: LinearWebhookPayload = {
      type: "AgentSessionEvent",
      action: "prompted",
      agentSession: { id: "session-1", issue: { id: "issue-uuid" } },
      agentActivity: { body: "here is the stacktrace", signal: null },
    };
    expect(extractCommentBody(prompted)).toBe("here is the stacktrace");
    expect(isAgentStopSignal({ agentActivity: { signal: "stop" } })).toBe(true);
  });

  it("ignores oauth/app actors on comments so Atrium cannot loop on itself", () => {
    expect(isHumanLinearActor({ type: "oauthclient" })).toBe(false);
    expect(isHumanLinearActor({ type: "user" })).toBe(true);
  });
});
