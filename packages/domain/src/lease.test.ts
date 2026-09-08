import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_TTL_MS,
  isHeartbeatStale,
  isPairingExpired,
  LEASE_EXPIRED_SUMMARY,
} from "./lease";

describe("lease expiry", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  it("treats a missing heartbeat as stale", () => {
    expect(isHeartbeatStale(null, now)).toBe(true);
  });

  it("expires a machine after three missed heartbeats", () => {
    const fresh = new Date(now.getTime() - HEARTBEAT_TTL_MS + 1_000);
    const stale = new Date(now.getTime() - HEARTBEAT_TTL_MS - 1_000);
    expect(isHeartbeatStale(fresh, now)).toBe(false);
    expect(isHeartbeatStale(stale, now)).toBe(true);
  });

  it("expires pairing codes after 15 minutes", () => {
    expect(isPairingExpired(new Date(now.getTime() - 14 * 60_000), now)).toBe(false);
    expect(isPairingExpired(new Date(now.getTime() - 16 * 60_000), now)).toBe(true);
  });

  it("marks expired running leases as failed and requeueable", () => {
    expect(LEASE_EXPIRED_SUMMARY).toMatch(/requeueable/);
  });
});
