import { createHmac, timingSafeEqual } from "node:crypto";

function secretBytes(): Uint8Array {
  const secret = process.env.MACHINE_JWT_SECRET;
  if (!secret) {
    throw new Error("MACHINE_JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export type MachineClaims = {
  typ: "machine";
  machineId: string;
};

export async function signMachineJwt(machineId: string): Promise<string> {
  const { SignJWT } = await import("jose");
  return new SignJWT({ typ: "machine", machineId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(machineId)
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secretBytes());
}

export async function verifyMachineJwt(token: string): Promise<MachineClaims> {
  const { jwtVerify } = await import("jose");
  const { payload } = await jwtVerify(token, secretBytes());
  if (payload.typ !== "machine" || typeof payload.machineId !== "string") {
    throw new Error("not a machine token");
  }
  return { typ: "machine", machineId: payload.machineId };
}

export function bearerToken(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export function hashToken(token: string): string {
  return createHmac("sha256", "atrium-machine").update(token).digest("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
