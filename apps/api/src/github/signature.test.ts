import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyGitHubSignature } from "./signature";

describe("verifyGitHubSignature", () => {
  it("accepts a matching sha256 HMAC", () => {
    const secret = "whsec";
    const body = `{"zen":"ok"}`;
    const digest = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyGitHubSignature(body, `sha256=${digest}`, secret)).toBe(true);
  });

  it("rejects a bad signature", () => {
    expect(verifyGitHubSignature("{}", "sha256=deadbeef", "whsec")).toBe(false);
    expect(verifyGitHubSignature("{}", null, "whsec")).toBe(false);
  });
});
