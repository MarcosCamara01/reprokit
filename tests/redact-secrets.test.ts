import { describe, it, expect } from "vitest";
import { redactSecrets, redactAndTruncate } from "../src/utils/redact-secrets.js";

describe("redactSecrets", () => {
  it("redacts KEY=VALUE assignments", () => {
    const out = redactSecrets("GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(out).toContain("GITHUB_TOKEN=");
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts DATABASE_URL", () => {
    const out = redactSecrets("DATABASE_URL=postgres://user:pass@host:5432/db");
    expect(out).not.toContain("postgres://user:pass@host");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts GitHub token shapes anywhere", () => {
    const out = redactSecrets("token is ghp_abcdefghijklmnopqrstuvwxyz0123456789 ok");
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("redacts Bearer tokens", () => {
    const out = redactSecrets("Authorization: Bearer abcdef1234567890ABCDEF");
    expect(out).toContain("Bearer [REDACTED]");
    expect(out).not.toContain("abcdef1234567890ABCDEF");
  });

  it("redacts basic-auth in URLs", () => {
    const out = redactSecrets("git clone https://x-access-token:ghp_secret12345678901234@github.com/o/r.git");
    expect(out).not.toContain("ghp_secret12345678901234");
    expect(out).toContain("[REDACTED]@");
  });

  it("redacts OpenAI/Anthropic keys", () => {
    expect(redactSecrets("sk-abcdefghijklmnopqrstuvwxyz12")).toContain("[REDACTED]");
    expect(redactSecrets("sk-ant-abcdefghijklmnopqrstuvwxyz12")).toContain("[REDACTED]");
  });

  it("leaves ordinary text intact", () => {
    expect(redactSecrets("the test failed on line 42")).toBe("the test failed on line 42");
  });
});

describe("redactAndTruncate", () => {
  it("truncates and notes dropped characters", () => {
    const out = redactAndTruncate("x".repeat(100), 20);
    expect(out.startsWith("x".repeat(20))).toBe(true);
    expect(out).toContain("truncated");
  });

  it("does not truncate short input", () => {
    expect(redactAndTruncate("short", 100)).toBe("short");
  });
});
