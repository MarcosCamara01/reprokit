import { describe, it, expect } from "vitest";
import { coerceReproResult } from "../src/workers/coding-worker.ts";

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
