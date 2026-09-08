import { describe, expect, it } from "vitest";
import { discoverEveJobsUrl, eveHealthUrl, eveJobsUrl, shouldSkipEve } from "./mode";

describe("eve mode", () => {
  it("skips Eve in CI unless ATRIUM_EVE=1", () => {
    expect(shouldSkipEve({ CI: "true" })).toBe(true);
    expect(shouldSkipEve({ CI: "true", ATRIUM_EVE: "1" })).toBe(false);
    expect(shouldSkipEve({ ATRIUM_EVE: "0" })).toBe(true);
    expect(shouldSkipEve({})).toBe(false);
  });

  it("normalizes jobs and health URLs", () => {
    expect(eveJobsUrl("http://127.0.0.1:2000")).toBe("http://127.0.0.1:2000/jobs");
    expect(eveJobsUrl("http://127.0.0.1:2000/jobs")).toBe("http://127.0.0.1:2000/jobs");
    expect(eveHealthUrl("http://127.0.0.1:2000/jobs")).toBe("http://127.0.0.1:2000/eve/v1/health");
  });

  it("falls back when Eve is not healthy", async () => {
    const url = await discoverEveJobsUrl(
      { ATRIUM_EVE_JOBS_URL: "http://127.0.0.1:59999/jobs" },
      async () => {
        throw new Error("offline");
      },
    );
    expect(url).toBeNull();
  });

  it("does not probe localhost unless ATRIUM_EVE=1", async () => {
    const url = await discoverEveJobsUrl({}, async () => {
      throw new Error("should not fetch");
    });
    expect(url).toBeNull();
  });

  it("uses a healthy Eve jobs URL", async () => {
    const url = await discoverEveJobsUrl(
      { ATRIUM_EVE_JOBS_URL: "http://127.0.0.1:2000" },
      async () =>
        new Response(JSON.stringify({ ok: true, status: "ready" }), { status: 200 }),
    );
    expect(url).toBe("http://127.0.0.1:2000/jobs");
  });
});
