import { describe, expect, it } from "vitest";
import { generatePairingCode } from "./pairing";

describe("pairing codes", () => {
  it("emits a 6-digit code", () => {
    const code = generatePairingCode();
    expect(code).toMatch(/^\d{6}$/);
  });
});
