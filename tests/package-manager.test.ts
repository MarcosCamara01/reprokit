import { describe, it, expect } from "vitest";
import {
  detectPackageManagerFromFiles,
  detectScriptsFromPackageJson,
} from "../src/utils/package-manager.ts";

describe("detectPackageManagerFromFiles", () => {
  it("detects pnpm", () => {
    expect(detectPackageManagerFromFiles(["pnpm-lock.yaml", "package.json"])).toBe("pnpm");
  });
  it("detects npm", () => {
    expect(detectPackageManagerFromFiles(["package-lock.json"])).toBe("npm");
  });
  it("detects yarn", () => {
    expect(detectPackageManagerFromFiles(["yarn.lock"])).toBe("yarn");
  });
  it("detects bun (.lockb and .lock)", () => {
    expect(detectPackageManagerFromFiles(["bun.lockb"])).toBe("bun");
    expect(detectPackageManagerFromFiles(["bun.lock"])).toBe("bun");
  });
  it("defaults to npm when no lockfile", () => {
    expect(detectPackageManagerFromFiles(["package.json"])).toBe("npm");
    expect(detectPackageManagerFromFiles([])).toBe("npm");
  });
  it("prefers pnpm over npm when both present", () => {
    expect(
      detectPackageManagerFromFiles(["package-lock.json", "pnpm-lock.yaml"]),
    ).toBe("pnpm");
  });
});

describe("detectScriptsFromPackageJson", () => {
  it("maps common script intents", () => {
    const scripts = detectScriptsFromPackageJson({
      scripts: {
        "type-check": "tsc --noEmit",
        lint: "eslint .",
        test: "vitest run",
        build: "tsc -b",
        "test:e2e": "playwright test",
        dev: "next dev",
      },
    });
    expect(scripts.typecheck).toBe("type-check");
    expect(scripts.lint).toBe("lint");
    expect(scripts.test).toBe("test");
    expect(scripts.build).toBe("build");
    expect(scripts.e2e).toBe("test:e2e");
    expect(scripts.dev).toBe("dev");
  });

  it("handles missing scripts gracefully", () => {
    const scripts = detectScriptsFromPackageJson({});
    expect(scripts.test).toBeUndefined();
    expect(scripts.all).toEqual({});
  });

  it("detects playwright separately from e2e", () => {
    const scripts = detectScriptsFromPackageJson({
      scripts: { playwright: "playwright test" },
    });
    expect(scripts.playwright).toBe("playwright");
  });
});
