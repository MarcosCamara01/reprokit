import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

let loaded = false;

/** Load local .env values for CLI/dev without overriding real environment vars. */
export function loadLocalEnv(path = ".env"): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(path)) return;

  loadEnvFile(path);
}
