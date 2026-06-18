import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

/** Lockfile -> package manager, in priority order. */
const LOCKFILES: Array<{ file: string; pm: PackageManager }> = [
  { file: "pnpm-lock.yaml", pm: "pnpm" },
  { file: "bun.lockb", pm: "bun" },
  { file: "bun.lock", pm: "bun" },
  { file: "yarn.lock", pm: "yarn" },
  { file: "package-lock.json", pm: "npm" },
];

/**
 * Pure detection from a list of filenames present in the repo root.
 * Exposed separately so it is trivially unit-testable.
 */
export function detectPackageManagerFromFiles(files: string[]): PackageManager {
  const set = new Set(files);
  for (const { file, pm } of LOCKFILES) {
    if (set.has(file)) return pm;
  }
  return "npm"; // safe default
}

/** Detect the package manager for a real directory on disk. */
export function detectPackageManager(dir: string): PackageManager {
  for (const { file, pm } of LOCKFILES) {
    if (existsSync(join(dir, file))) return pm;
  }
  return "npm";
}

export interface DetectedScripts {
  lint?: string;
  test?: string;
  typecheck?: string;
  build?: string;
  e2e?: string;
  playwright?: string;
  dev?: string;
  /** All raw scripts, for reference. */
  all: Record<string, string>;
}

/** Map well-known script intents onto whatever names the project actually uses. */
const SCRIPT_ALIASES: Record<keyof Omit<DetectedScripts, "all">, string[]> = {
  typecheck: ["typecheck", "type-check", "tsc", "check-types", "types"],
  lint: ["lint", "eslint", "lint:check"],
  test: ["test", "test:unit", "unit", "vitest", "jest"],
  build: ["build", "compile"],
  e2e: ["e2e", "test:e2e", "cypress", "cypress:run"],
  playwright: ["playwright", "test:playwright", "pw", "pw:test"],
  dev: ["dev", "start", "serve"],
};

/** Pure detection from a parsed package.json object. */
export function detectScriptsFromPackageJson(pkg: {
  scripts?: Record<string, string>;
}): DetectedScripts {
  const all = pkg.scripts ?? {};
  const result: DetectedScripts = { all };
  for (const intent of Object.keys(SCRIPT_ALIASES) as Array<
    keyof typeof SCRIPT_ALIASES
  >) {
    const match = SCRIPT_ALIASES[intent].find((name) => name in all);
    if (match) result[intent] = match;
  }
  return result;
}

/** Read package.json from disk and detect scripts. Returns null if missing. */
export function detectScripts(dir: string): DetectedScripts | null {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return detectScriptsFromPackageJson(pkg);
  } catch {
    return null;
  }
}

/** Build the argv to run a named script with the detected package manager. */
export function runScriptArgs(
  pm: PackageManager,
  scriptName: string,
): { bin: string; args: string[] } {
  const bin = packageManagerBin(pm);
  switch (pm) {
    case "npm":
      return { bin, args: ["run", scriptName] };
    case "pnpm":
      return { bin, args: ["run", scriptName] };
    case "yarn":
      return { bin, args: [scriptName] };
    case "bun":
      return { bin, args: ["run", scriptName] };
  }
}

/** Build the argv to install dependencies with the detected package manager. */
export function installArgs(pm: PackageManager): { bin: string; args: string[] } {
  const bin = packageManagerBin(pm);
  switch (pm) {
    case "npm":
      return { bin, args: ["install", "--no-audit", "--no-fund"] };
    case "pnpm":
      return { bin, args: ["install"] };
    case "yarn":
      return { bin, args: ["install"] };
    case "bun":
      return { bin, args: ["install"] };
  }
}

function packageManagerBin(pm: PackageManager): string {
  return process.platform === "win32" ? `${pm}.cmd` : pm;
}
