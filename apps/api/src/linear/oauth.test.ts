import { describe, expect, it } from "vitest";
import {
  linearAuthorizeUrl,
  linearWebhookPublicPath,
  signLinearOAuthState,
  verifyLinearOAuthState,
} from "./oauth";

describe("Linear OAuth helpers", () => {
  it("signs and verifies CSRF state", () => {
    const secret = "state-secret-at-least-32-characters";
    const state = signLinearOAuthState(
      { organizationId: "org-1", userId: "user-1" },
      secret,
    );
    const parsed = verifyLinearOAuthState(state, secret);
    expect(parsed).toMatchObject({ organizationId: "org-1", userId: "user-1" });
  });

  it("rejects tampered or stale state", () => {
    const secret = "state-secret-at-least-32-characters";
    const state = signLinearOAuthState(
      { organizationId: "org-1", userId: "user-1" },
      secret,
    );
    expect(verifyLinearOAuthState(`${state}x`, secret)).toBeNull();
    expect(
      verifyLinearOAuthState(state, secret, Date.now() + 11 * 60 * 1000),
    ).toBeNull();
  });

  it("builds an app-actor authorize URL and the public webhook path", () => {
    const url = linearAuthorizeUrl({
      clientId: "cid",
      redirectUri: "http://localhost:3000/api/linear/callback",
      state: "abc",
    });
    expect(url).toContain("actor=app");
    expect(url).toContain("app%3Aassignable");
    expect(linearWebhookPublicPath()).toBe("/webhooks/linear");
  });
});
