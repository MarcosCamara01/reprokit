import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface WorkerRunMetadata {
  model: string;
  effort: string;
}

const UNKNOWN = "unknown";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readCodexConfigValue(key: string): string | undefined {
  try {
    const config = readFileSync(join(homedir(), ".codex", "config.toml"), "utf8");
    const match = config.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
    return clean(match?.[1]);
  } catch {
    return undefined;
  }
}

export function codexMetadata(): WorkerRunMetadata {
  return {
    model: clean(process.env.CODEX_MODEL) ?? readCodexConfigValue("model") ?? UNKNOWN,
    effort:
      clean(process.env.CODEX_EFFORT) ??
      clean(process.env.CODEX_REASONING_EFFORT) ??
      readCodexConfigValue("model_reasoning_effort") ??
      UNKNOWN,
  };
}

export function claudeMetadata(): WorkerRunMetadata {
  return {
    model: clean(process.env.CLAUDE_MODEL) ?? "claude-opus-4-8",
    effort: clean(process.env.CLAUDE_EFFORT) ?? "high",
  };
}

export function mockMetadata(): WorkerRunMetadata {
  return { model: "mock", effort: "mock" };
}
