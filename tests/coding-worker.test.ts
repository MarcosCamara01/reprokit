import { describe, it, expect } from "vitest";
import { coerceReproResult, coerceFixResult } from "../src/workers/coding-worker.ts";

describe("coerceReproResult screenshots", () => {
  it("maps a screenshots array from the worker JSON", () => {
    const r = coerceReproResult("claude", {
      reproduced: true,
      screenshots: ["./.reprokit-artifacts/before.png", "./.reprokit-artifacts/after.png"],
    });
    expect(r.screenshots).toEqual([
      "./.reprokit-artifacts/before.png",
      "./.reprokit-artifacts/after.png",
    ]);
  });

  it("defaults screenshots to an empty array when absent", () => {
    expect(coerceReproResult("claude", { reproduced: false }).screenshots).toEqual([]);
    expect(coerceReproResult("claude", null).screenshots).toEqual([]);
  });
});

describe("coerceFixResult screenshots", () => {
  it("maps the fix worker's before/after verification screenshots", () => {
    const r = coerceFixResult("codex", {
      fixed: true,
      screenshots: ["./.reprokit-artifacts/before.png", "./.reprokit-artifacts/after.png"],
    });
    expect(r.screenshots).toEqual([
      "./.reprokit-artifacts/before.png",
      "./.reprokit-artifacts/after.png",
    ]);
  });

  it("defaults screenshots to an empty array when absent", () => {
    expect(coerceFixResult("codex", { fixed: true }).screenshots).toEqual([]);
    expect(coerceFixResult("codex", null).screenshots).toEqual([]);
  });
});
