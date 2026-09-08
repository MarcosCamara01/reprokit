import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { credentialsPath } from "./config";

export type MachineCredentials = {
  token: string;
  machineId: string;
  url: string;
  name?: string;
};

export function loadCredentials(): MachineCredentials {
  const path = credentialsPath();
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as MachineCredentials;
  if (!parsed.token || !parsed.url) {
    throw new Error(`invalid credentials file at ${path}`);
  }
  return parsed;
}

export function saveCredentials(creds: MachineCredentials): string {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best-effort on platforms without chmod.
  }
  return path;
}
