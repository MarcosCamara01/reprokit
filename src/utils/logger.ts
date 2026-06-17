import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { redactSecrets } from "./redact-secrets.ts";

type Level = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
  child(scope: string): Logger;
}

function format(level: Level, scope: string, msg: string, meta?: unknown): string {
  const parts = [`[${level.toUpperCase()}]`, scope ? `(${scope})` : "", msg];
  let line = parts.filter(Boolean).join(" ");
  if (meta !== undefined) {
    try {
      line += " " + JSON.stringify(meta);
    } catch {
      line += " " + String(meta);
    }
  }
  // Everything that goes through the logger is redacted.
  return redactSecrets(line);
}

/**
 * Create a logger. If `filePath` is provided, lines are also appended there
 * (after redaction). No timestamps are emitted here so unit output stays
 * deterministic; the webhook/CLI wrappers can add them if desired.
 */
export function createLogger(scope = "", filePath?: string): Logger {
  if (filePath) {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
    } catch {
      /* ignore */
    }
  }

  const emit = (level: Level, msg: string, meta?: unknown) => {
    const line = format(level, scope, msg, meta);
    const sink = level === "error" || level === "warn" ? console.error : console.log;
    sink(line);
    if (filePath) {
      try {
        appendFileSync(filePath, line + "\n");
      } catch {
        /* never let logging crash the run */
      }
    }
  };

  return {
    debug: (m, meta) => emit("debug", m, meta),
    info: (m, meta) => emit("info", m, meta),
    warn: (m, meta) => emit("warn", m, meta),
    error: (m, meta) => emit("error", m, meta),
    child: (sub) => createLogger(scope ? `${scope}:${sub}` : sub, filePath),
  };
}

export const logger = createLogger("reprokit");
