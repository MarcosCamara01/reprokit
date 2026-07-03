import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sandboxConfig = join(process.cwd(), "agent", "sandbox", "sandbox.ts");

describe("Eve sandbox config", () => {
  it("defines an explicit sandbox with GitHub/network policy context", () => {
    expect(existsSync(sandboxConfig)).toBe(true);
    const source = readFileSync(sandboxConfig, "utf8");
    expect(source).toContain("defineSandbox");
    expect(source).toContain("defaultBackend");
    expect(source).toContain("github.com");
  });
});
