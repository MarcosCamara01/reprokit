import { accessSync, constants, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveAtriumHome(): string {
  if (process.env.ATRIUM_HOME) return process.env.ATRIUM_HOME;
  const preferred = join(homedir(), "atrium");
  try {
    mkdirSync(preferred, { recursive: true });
    accessSync(preferred, constants.W_OK);
    return preferred;
  } catch {
    const fallback = join(process.cwd(), ".atrium");
    mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

export function cacheDir(home: string, owner: string, repo: string): string {
  return join(home, "cache", owner, `${repo}.git`);
}

export function runDir(home: string, runId: string, suffix?: string): string {
  return join(home, "runs", suffix ? `${runId}-${suffix}` : runId);
}

export function credentialsPath(): string {
  return join(homedir(), ".atrium", "machine.json");
}

export function branchName(pipeline: string, identifier: string, runId: string): string {
  const ticket = identifier.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "ticket";
  return `atrium/${pipeline}/${ticket}/${runId.slice(0, 8)}`;
}

export const DIAGNOSE_TIMEOUT_MS = 20 * 60_000;
export const IMPLEMENT_TIMEOUT_MS = 45 * 60_000;
