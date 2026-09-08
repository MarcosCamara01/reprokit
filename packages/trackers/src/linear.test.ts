import { describe, expect, it } from "vitest";
import { LinearTracker } from "./linear";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LinearTracker", () => {
  const ref = {
    provider: "linear" as const,
    externalId: "issue-uuid",
    identifier: "ENG-12",
  };

  it("getIssue maps GraphQL fields onto a TicketSnapshot", async () => {
    const calls: unknown[] = [];
    const tracker = new LinearTracker({
      accessToken: "lin_token",
      fetch: async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return jsonResponse({
          issue: {
            id: "issue-uuid",
            identifier: "ENG-12",
            title: "Checkout 500",
            description: "Steps to reproduce on /pay.",
            url: "https://linear.app/acme/issue/ENG-12",
            team: { id: "team-1" },
            project: { id: "proj-1" },
            labels: { nodes: [{ name: "bug" }] },
          },
        });
      },
    });

    const snapshot = await tracker.getIssue(ref);
    expect(snapshot.ref.identifier).toBe("ENG-12");
    expect(snapshot.title).toBe("Checkout 500");
    expect(snapshot.labels).toEqual(["bug"]);
    expect(calls[0]).toMatchObject({
      variables: { id: "issue-uuid" },
    });
  });

  it("postComment, requestInfo, and linkPr hit Linear mutations", async () => {
    const queries: string[] = [];
    const tracker = new LinearTracker({
      accessToken: "lin_token",
      agentSessionId: "session-1",
      runUrl: "https://app.atrium.dev/runs/r1",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { query: string };
        queries.push(body.query);
        return jsonResponse({ ok: true });
      },
    });

    await tracker.postComment(ref, "hello");
    await tracker.requestInfo(ref, ["Which GitHub repository?"]);
    await tracker.linkPr(ref, {
      url: "https://github.com/acme/app/pull/9",
      title: "Fix checkout",
    });

    expect(queries.some((q) => q.includes("commentCreate"))).toBe(true);
    expect(queries.some((q) => q.includes("attachmentCreate"))).toBe(true);
    expect(queries.some((q) => q.includes("agentActivityCreate"))).toBe(true);
    expect(queries.some((q) => q.includes("agentSessionUpdate"))).toBe(true);
  });

  it("sends a Bearer Authorization header", async () => {
    let auth = "";
    const tracker = new LinearTracker({
      accessToken: "raw-token",
      fetch: async (_url, init) => {
        const headers = new Headers(init?.headers);
        auth = headers.get("authorization") ?? "";
        return jsonResponse({
          issue: {
            id: "issue-uuid",
            identifier: "ENG-12",
            title: "t",
            description: "",
            url: "https://linear.app/acme/issue/ENG-12",
          },
        });
      },
    });
    await tracker.getIssue(ref);
    expect(auth).toBe("Bearer raw-token");
  });
});
