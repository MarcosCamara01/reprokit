import { createHmac, timingSafeEqual } from "node:crypto";

export const LINEAR_WEBHOOK_MAX_SKEW_MS = 60_000;

export function verifyLinearSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const computed = createHmac("sha256", secret).update(payload).digest();
  let header: Buffer;
  try {
    header = Buffer.from(signatureHeader, "hex");
  } catch {
    return false;
  }
  if (header.length !== computed.length) return false;
  return timingSafeEqual(header, computed);
}

export function verifyLinearTimestamp(
  webhookTimestamp: number | undefined,
  nowMs = Date.now(),
  maxSkewMs = LINEAR_WEBHOOK_MAX_SKEW_MS,
): boolean {
  if (typeof webhookTimestamp !== "number" || !Number.isFinite(webhookTimestamp)) {
    return false;
  }
  return Math.abs(nowMs - webhookTimestamp) <= maxSkewMs;
}
