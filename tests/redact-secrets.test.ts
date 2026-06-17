import { describe, it, expect } from "vitest";
import { redactSecrets, redactAndTruncate } from "../src/utils/redact-secrets.ts";

// NOTE: these are NOT real credentials. They are assembled by concatenation at
// runtime so that no token-shaped literal ever exists in the committed source.
// This keeps GitHub Secret Scanning from flagging this fixture file while still
// exercising the redaction patterns. (Validity of these strings: always invalid.)
const FAKE_GH_PAT = "ghp_" + "a".repeat(36);
const FAKE_GH_SHORT = "ghp_" + "b".repeat(24);
const FAKE_OPENAI = "sk-" + "c".repeat(40);
const FAKE_ANTHROPIC = "sk-ant-" + "d".repeat(40);
const FAKE_BEARER = "e".repeat(24);

describe("redactSecrets", () => {
  it("redacts KEY=VALUE assignments", () => {
    const out = redactSecrets(`GITHUB_TOKEN=${FAKE_GH_PAT}`);
    expect(out).toContain("GITHUB_TOKEN=");
    expect(out).not.toContain(FAKE_GH_PAT);
    expect(out).toContain("[REDACTED]");
  });

  it("redacts DATABASE_URL", () => {
    const out = redactSecrets("DATABASE_URL=postgres://user:pass@host:5432/db");
    expect(out).not.toContain("postgres://user:pass@host");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts GitHub token shapes anywhere", () => {
    const out = redactSecrets(`token is ${FAKE_GH_PAT} ok`);
    expect(out).not.toContain(FAKE_GH_PAT);
  });

  it("redacts Bearer tokens", () => {
    const out = redactSecrets(`Authorization: Bearer ${FAKE_BEARER}`);
    expect(out).toContain("Bearer [REDACTED]");
    expect(out).not.toContain(FAKE_BEARER);
  });

  it("redacts basic-auth in URLs", () => {
    const out = redactSecrets(
      `git clone https://x-access-token:${FAKE_GH_SHORT}@github.com/o/r.git`,
    );
    expect(out).not.toContain(FAKE_GH_SHORT);
    expect(out).toContain("[REDACTED]@");
  });

  it("redacts OpenAI/Anthropic keys", () => {
    expect(redactSecrets(FAKE_OPENAI)).toContain("[REDACTED]");
    expect(redactSecrets(FAKE_ANTHROPIC)).toContain("[REDACTED]");
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
