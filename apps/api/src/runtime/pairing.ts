import { hashToken } from "./jwt";
import { createPairingMachine, getDb, isDatabaseConfigured } from "@atrium/db";
import { randomInt } from "node:crypto";

export function generatePairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function handleCreatePairing(input: { organizationId: string }) {
  if (!isDatabaseConfigured()) {
    throw Object.assign(new Error("DATABASE_URL is not set"), { status: 503 });
  }
  const code = generatePairingCode();
  const machine = await createPairingMachine(getDb(), {
    organizationId: input.organizationId,
    codeHash: hashToken(code),
  });
  return {
    code,
    machineId: machine.id,
    expiresInSeconds: 15 * 60,
    joinCommand: `atrium machine join --code ${code}`,
  };
}
