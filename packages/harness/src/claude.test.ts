import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claudeHarness } from "./claude";
import { collectCapabilities, getHarness } from "./registry";

const previous = {
  claude: process.env.ATRIUM_CLAUDE_BIN,
  codex: process.env.ATRIUM_CODEX_BIN,
  cursor: process.env.ATRIUM_CURSOR_BIN,
  path: process.env.PATH,
};

afterEach(() => {
  restore("ATRIUM_CLAUDE_BIN", previous.claude);
  restore("ATRIUM_CODEX_BIN", previous.codex);
  restore("ATRIUM_CURSOR_BIN", previous.cursor);
  process.env.PATH = previous.path;
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function fakeCli(result: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "atrium-harness-"));
  const script = join(dir, "claude");
  const payload = JSON.stringify({ type: "result", ...result });
  writeFileSync(
    script,
    `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(payload)} + "\\n");
process.exit(0);
`,
    { encoding: "utf8" },
  );
  chmodSync(script, 0o755);
  return script;
}

describe("claude harness with a fake CLI", () => {
  it("streams stream-json results and never uses the mock in the prod adapter", () => {
    process.env.ATRIUM_CLAUDE_BIN = fakeCli({
      reproduced: true,
      summary: "reproduced on /pay",
    });
    return (async () => {
      const health = await claudeHarness.health();
      expect(health.available).toBe(true);

      const events = [];
      for await (const event of claudeHarness.run({
        runId: "run-1",
        mode: "diagnose",
        worktree: process.cwd(),
        prompt: "diagnose",
        timeoutMs: 5_000,
        permission: "readonly",
      })) {
        events.push(event);
      }
      expect(events.some((event) => event.type === "result")).toBe(true);
      expect(events.at(-1)).toEqual({ type: "exit", code: 0 });
    })();
  });

  it("reports missing binaries as unavailable", async () => {
    process.env.ATRIUM_CLAUDE_BIN = join(tmpdir(), "no-such-claude-binary");
    process.env.ATRIUM_CODEX_BIN = join(tmpdir(), "no-such-codex-binary");
    process.env.ATRIUM_CURSOR_BIN = join(tmpdir(), "no-such-agent-binary");
    const { capabilities } = await collectCapabilities();
    expect(capabilities.harnesses).not.toContain("claude");
  });
});

describe("registry", () => {
  it("does not return the test mock from getHarness", () => {
    expect(getHarness("claude").id).toBe("claude");
    expect(getHarness("codex").id).toBe("codex");
    expect(getHarness("cursor").id).toBe("cursor");
  });
});
