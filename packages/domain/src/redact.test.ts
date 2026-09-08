import { describe, expect, it } from "vitest";
import { redactEventMessage, redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("strips GitHub PATs, JWTs, and connection strings", () => {
    const raw = [
      "token ghp_abcdefghijklmnopqrstuvwxyz012345",
      "jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abcdeflongsignaturevaluehere",
      "url postgres://user:hunter2@db.example.com/app",
      "GITHUB_APP_PRIVATE_KEY=super-secret",
    ].join("\n");
    const redacted = redactSecrets(raw);
    expect(redacted).not.toMatch(/ghp_/);
    expect(redacted).not.toMatch(/eyJhbGci/);
    expect(redacted).not.toMatch(/hunter2/);
    expect(redacted).not.toMatch(/super-secret/);
    expect(redacted).toMatch(/\[REDACTED\]/);
  });

  it("truncates long event messages after redaction", () => {
    const message = redactEventMessage(`ok ${"a".repeat(100)}`, 20);
    expect(message.length).toBeLessThan(40);
    expect(message).toMatch(/truncated/);
  });
});
