export const HEARTBEAT_INTERVAL_MS = 15_000;
export const LEASE_WAIT_MS = 25_000;
/** Three missed heartbeats. */
export const HEARTBEAT_TTL_MS = 45_000;
export const PAIRING_TTL_MS = 15 * 60_000;

export function isHeartbeatStale(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date(),
  ttlMs = HEARTBEAT_TTL_MS,
): boolean {
  if (!lastSeenAt) return true;
  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  return now.getTime() - seen.getTime() > ttlMs;
}

export function isPairingExpired(
  createdAt: Date | string,
  now: Date = new Date(),
  ttlMs = PAIRING_TTL_MS,
): boolean {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return now.getTime() - created.getTime() > ttlMs;
}

export const LEASE_EXPIRED_SUMMARY = "lease expired; requeueable";
