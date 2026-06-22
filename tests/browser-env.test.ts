import { describe, it, expect } from "vitest";
import { buildBrowserEnv, browserFieldsFor } from "../src/workflow/browser-env.ts";
import type { IssueContext } from "../src/types.ts";

function issue(needsBrowser: boolean): IssueContext {
  return {
    provider: "github",
    id: "7",
    number: 7,
    url: "https://example.test/issues/7",
    title: "t",
    body: "b",
    labels: [],
    comments: [],
    parsedBug: { summary: "s", reproductionSteps: ["step"], needsBrowser },
  };
}

describe("buildBrowserEnv", () => {
  it("is headless, session-isolated per run, and localhost-only", () => {
    const env = buildBrowserEnv(990123);
    expect(env.AGENT_BROWSER_HEADED).toBe("0");
    expect(env.AGENT_BROWSER_SESSION).toContain("990123");
    expect(env.AGENT_BROWSER_ALLOWED_DOMAINS).toContain("localhost");
    expect(env.AGENT_BROWSER_ALLOWED_DOMAINS).toContain("127.0.0.1");
    expect(env.AGENT_BROWSER_ALLOWED_DOMAINS).not.toContain("example.com");
  });

  it("gives different runs different sessions", () => {
    expect(buildBrowserEnv("a").AGENT_BROWSER_SESSION).not.toBe(
      buildBrowserEnv("b").AGENT_BROWSER_SESSION,
    );
  });
});

describe("browserFieldsFor", () => {
  it("grants browser + constrained env when the bug needs a browser", () => {
    const fields = browserFieldsFor(issue(true), 7);
    expect(fields.browser).toBe(true);
    expect(fields.env?.AGENT_BROWSER_HEADED).toBe("0");
  });

  it("grants nothing when the bug does not need a browser", () => {
    const fields = browserFieldsFor(issue(false), 7);
    expect(fields).toEqual({});
    expect("browser" in fields).toBe(false);
  });
});
