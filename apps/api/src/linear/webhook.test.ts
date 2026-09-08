import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleLinearWebhook } from "./webhook";

function signed(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("handleLinearWebhook", () => {
  it("rejects an invalid Linear-Signature", async () => {
    const result = await handleLinearWebhook({
      rawBody: `{"type":"Comment","action":"create"}`,
      signature: "deadbeef",
      event: "Comment",
      secret: "whsec",
    });
    expect(result).toEqual({ ok: false, error: "invalid signature", status: 401 });
  });

  it("rejects a stale webhookTimestamp after signature check", async () => {
    const secret = "whsec";
    const body = JSON.stringify({
      type: "Comment",
      action: "create",
      webhookTimestamp: 1,
    });
    const result = await handleLinearWebhook({
      rawBody: body,
      signature: signed(body, secret),
      event: "Comment",
      secret,
      nowMs: Date.now(),
    });
    expect(result).toEqual({ ok: false, error: "stale webhook", status: 401 });
  });
});
