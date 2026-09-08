import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyLinearSignature, verifyLinearTimestamp } from "./signature";

describe("verifyLinearSignature", () => {
  it("accepts a matching hex HMAC of the raw body", () => {
    const secret = "lin_whsec";
    const body = `{"action":"create","type":"Comment"}`;
    const digest = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyLinearSignature(body, digest, secret)).toBe(true);
  });

  it("rejects a bad or missing signature", () => {
    expect(verifyLinearSignature("{}", "deadbeef", "whsec")).toBe(false);
    expect(verifyLinearSignature("{}", null, "whsec")).toBe(false);
    expect(verifyLinearSignature("{}", "ab", "")).toBe(false);
  });
});

describe("verifyLinearTimestamp", () => {
  it("accepts timestamps within 60s", () => {
    const now = 1_700_000_000_000;
    expect(verifyLinearTimestamp(now - 15_000, now)).toBe(true);
  });

  it("rejects stale deliveries", () => {
    const now = 1_700_000_000_000;
    expect(verifyLinearTimestamp(now - 120_000, now)).toBe(false);
    expect(verifyLinearTimestamp(undefined, now)).toBe(false);
  });
});
