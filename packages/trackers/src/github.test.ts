import { describe, expect, it } from "vitest";
import { GitHubTracker } from "./github";
import { TrackerNotImplementedError } from "./types";

describe("GitHubTracker openPullRequest", () => {
  it("POSTs /pulls and never calls merge", async () => {
    const calls: string[] = [];
    const tracker = new GitHubTracker({
      token: "ghs_test",
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        return new Response(
          JSON.stringify({ html_url: "https://github.com/acme/app/pull/9", number: 9 }),
          { status: 201 },
        );
      },
    });
    const pr = await tracker.openPullRequest({
      owner: "acme",
      repo: "app",
      title: "fix",
      body: "body",
      head: "atrium/bug_fix/12/abcd",
      base: "main",
    });
    expect(pr.url).toContain("/pull/9");
    expect(calls.join("\n")).toMatch(/\/pulls/);
    expect(calls.join("\n")).not.toMatch(/merge/);
  });
});

describe("GitHubTracker comments", () => {
  const ref = {
    provider: "github" as const,
    externalId: "99",
    identifier: "#412",
  };

  it("posts comments and PR links when a token is configured", async () => {
    const paths: string[] = [];
    const tracker = new GitHubTracker({
      token: "ghs_x",
      owner: "acme",
      repo: "app",
      apiUrl: "https://api.github.test",
      fetch: async (url, init) => {
        paths.push(`${init?.method ?? "GET"} ${String(url)}`);
        return new Response("{}", { status: 201 });
      },
    });

    await tracker.postComment(ref, "Need a stacktrace");
    await tracker.linkPr(ref, {
      url: "https://github.com/acme/app/pull/3",
      title: "Fix 412",
      runUrl: "https://app/runs/1",
    });

    expect(paths[0]).toContain("/repos/acme/app/issues/412/comments");
    expect(paths.join("\n")).not.toMatch(/merge/);
  });

  it("throws while comments are not token-backed", async () => {
    const tracker = new GitHubTracker();
    await expect(tracker.postComment(ref, "x")).rejects.toBeInstanceOf(
      TrackerNotImplementedError,
    );
  });
});
